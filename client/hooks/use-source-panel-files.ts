import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import type { SourcePanelPdf } from '@/components/SourcePanel';
import type { AvailableFile } from '@/types/chat';
import { AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	AUTH_SERVICE_FEATURE,
	createInvalidAuthTokenError,
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';
import * as FileSystem from 'expo-file-system/legacy';

type SourceMessage = {
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
};

type UseSourcePanelFilesParams = {
	availableFiles: AvailableFile[];
	isAvailableFilesLoading: boolean;
	serverUrl: string;
	onServiceError?: (featureName: string, error: unknown) => void;
	authTokenOverride?: string | null;
};

const isRemoteAuthorizedPdfSource = (source: unknown) =>
	Boolean(
		source &&
			typeof source === 'object' &&
			'uri' in source &&
			typeof (source as { uri?: unknown }).uri === 'string' &&
			'headers' in source,
	);

export const useSourcePanelFiles = ({
	availableFiles,
	isAvailableFilesLoading,
	serverUrl,
	onServiceError,
	authTokenOverride,
}: UseSourcePanelFilesParams) => {
	const [showSourcePanel, setShowSourcePanel] = useState<boolean>(false);
	const [sourcePanelPdf, setSourcePanelPdf] = useState<SourcePanelPdf | null>(null);
	const [isFileDownloading, setIsFileDownloading] = useState<boolean>(false);
	const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
	const [downloadedFileIds, setDownloadedFileIds] = useState<Set<number>>(new Set());
	const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);
	const webPdfObjectUrlRef = useRef<string | null>(null);

	const getLocalFilename = useCallback(
		(file: AvailableFile) => `attachment-${file.id}-${file.name.replace(/[\\/:*?"<>|]/g, '_')}`,
		[],
	);

	const getLocalFileUri = useCallback(
		(file: AvailableFile) =>
			FileSystem.documentDirectory
				? `${FileSystem.documentDirectory}${getLocalFilename(file)}`
				: null,
		[getLocalFilename],
	);

	const cancelDownload = useCallback(() => {
		if (downloadResumableRef.current) {
			downloadResumableRef.current.cancelAsync();
			downloadResumableRef.current = null;
		}
	}, []);

	useEffect(() => {
		let cancelled = false;

		const syncDownloadedFiles = async () => {
			if (!FileSystem.documentDirectory) return;

			const downloadedIds = await Promise.all(
				availableFiles.map(async (file) => {
					const fileUri = getLocalFileUri(file);
					if (!fileUri) return null;

					const info = await FileSystem.getInfoAsync(fileUri);
					return info.exists ? file.id : null;
				}),
			);

			if (!cancelled) {
				setDownloadedFileIds(
					new Set(downloadedIds.filter((id): id is number => id !== null)),
				);
			}
		};

		syncDownloadedFiles();

		return () => {
			cancelled = true;
		};
	}, [availableFiles, getLocalFileUri]);

	useEffect(
		() => () => {
			cancelDownload();
			if (webPdfObjectUrlRef.current && Platform.OS === 'web') {
				URL.revokeObjectURL(webPdfObjectUrlRef.current);
				webPdfObjectUrlRef.current = null;
			}
		},
		[cancelDownload],
	);

	const openPdfInSourcePanel = useCallback((pdf: SourcePanelPdf) => {
		setSourcePanelPdf(pdf);
		setShowSourcePanel(true);
	}, []);

	const openMessageSource = useCallback(
		(message: SourceMessage) => {
			if (!message.sourceAttachmentId) return;

			let authToken = '';
			try {
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				authToken = authTokenOverride ?? getAuthTokenOrThrow();
			} catch (error) {
				console.log('Handled auth token error:', error);
				onServiceError?.(getServiceErrorFeature(error, 'autoryzacja aplikacji'), error);
				return;
			}

			openPdfInSourcePanel({
				name: message.sourceAttachmentName || `Dokument_${message.sourceAttachmentId}.pdf`,
				icon: 'file-pdf-box',
				color: '#EF4444',
				source: {
					uri: `${serverUrl}/api/attachments/${message.sourceAttachmentId}/file`,
					headers: {
						Authorization: `Bearer ${authToken}`,
					},
				},
				page: (message.sourceAttachmentPage || 1) + 1,
			});
		},
		[authTokenOverride, onServiceError, openPdfInSourcePanel, serverUrl],
	);

	const openFilesPanel = useCallback(() => {
		setSourcePanelPdf(null);
		setShowSourcePanel(true);
	}, []);

	const closeSourcePanel = useCallback(() => {
		setShowSourcePanel(false);
		setSourcePanelPdf(null);
	}, []);

	const deleteDownloadedFile = useCallback(
		async (file: AvailableFile) => {
			try {
				if (Platform.OS !== 'web') {
					const fileUri = getLocalFileUri(file);
					if (fileUri) {
						const info = await FileSystem.getInfoAsync(fileUri);
						if (info.exists) {
							await FileSystem.deleteAsync(fileUri, { idempotent: true });
						}
					}
				}

				setDownloadedFileIds((prev) => {
					const next = new Set(prev);
					next.delete(file.id);
					return next;
				});
			} catch (error) {
				console.error('Delete downloaded file error:', error);
				Alert.alert('Błąd', `Nie udało się usunąć pliku: ${file.name}`);
			}
		},
		[getLocalFileUri],
	);

	const performFileDownload = useCallback(
		async (file: AvailableFile, targetPage: number = 1) => {
			if (isFileDownloading) return;

			setIsFileDownloading(true);
			setDownloadingFileId(file.id);

			try {
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = authTokenOverride ?? getAuthTokenOrThrow();

				if (Platform.OS === 'web') {
					if (webPdfObjectUrlRef.current) {
						URL.revokeObjectURL(webPdfObjectUrlRef.current);
						webPdfObjectUrlRef.current = null;
					}

					const response = await fetch(file.remoteUrl, {
						headers: { Authorization: `Bearer ${authToken}` },
					});

					if (!response.ok) {
						throwIfAuthResponseError(response);
						throw new Error(`PDF download failed: ${response.status}`);
					}

					const blob = await response.blob();
					const objectUrl = URL.createObjectURL(blob);
					webPdfObjectUrlRef.current = objectUrl;

					setSourcePanelPdf({
						name: file.name,
						icon: 'file-download',
						color: '#22C55E',
						source: objectUrl,
						page: targetPage,
					});
				} else {
					const localFileUri = getLocalFileUri(file);
					if (!localFileUri) {
						throw new Error('File system document directory is unavailable');
					}

					downloadResumableRef.current = FileSystem.createDownloadResumable(
						file.remoteUrl,
						localFileUri,
						{ headers: { Authorization: `Bearer ${authToken}` } },
					);

					const result = await downloadResumableRef.current.downloadAsync();

					if (result && 'status' in result) {
						const status = Number(result.status);
						if (status === 401 || status === 403) {
							throw createInvalidAuthTokenError(status);
						}
					}

					if (!result?.uri) {
						throw new Error('Download failed - no URI');
					}

					setSourcePanelPdf({
						name: file.name,
						icon: 'file-download',
						color: '#22C55E',
						source: { uri: result.uri },
						page: targetPage,
					});
				}

				setDownloadedFileIds((prev) => new Set(prev).add(file.id));
				setShowSourcePanel(true);
			} catch (error) {
				console.log('Handled download error:', error);
				const featureName = getServiceErrorFeature(error, 'pobieranie pliku');
				onServiceError?.(featureName, error);
				if (featureName !== AUTH_SERVICE_FEATURE) {
					Alert.alert('Błąd', `Nie udało się pobrać pliku: ${file.name}`);
				}
			} finally {
				setIsFileDownloading(false);
				setDownloadingFileId(null);
				downloadResumableRef.current = null;
			}
		},
		[authTokenOverride, getLocalFileUri, isFileDownloading, onServiceError],
	);

	const openFileInSourcePanel = useCallback(
		async (file: AvailableFile) => {
			const localFileUri = getLocalFileUri(file);

			if (downloadedFileIds.has(file.id) && localFileUri) {
				openPdfInSourcePanel({
					name: file.name,
					icon: 'file-download',
					color: '#22C55E',
					source: { uri: localFileUri },
					page: 1,
				});
				return;
			}

			await performFileDownload(file, 1);
		},
		[downloadedFileIds, getLocalFileUri, openPdfInSourcePanel, performFileDownload],
	);

	const handlePdfError = useCallback(
		(error: unknown) => {
			if (isRemoteAuthorizedPdfSource(sourcePanelPdf?.source)) {
				onServiceError?.(AUTH_SERVICE_FEATURE, createInvalidAuthTokenError(401));
				return;
			}

			onServiceError?.('podgląd pliku', error);
		},
		[onServiceError, sourcePanelPdf?.source],
	);

	return {
		cancelDownload,
		openFileInSourcePanel,
		openFilesPanel,
		openMessageSource,
		sourcePanelProps: {
			showSourcePanel,
			sourcePanelPdf,
			isAvailableFilesLoading,
			availableFiles,
			isFileDownloading,
			downloadingFileId,
			downloadedFileIds,
			onOpenFile: openFileInSourcePanel,
			onDeleteDownloadedFile: deleteDownloadedFile,
			onPdfError: handlePdfError,
			onClose: closeSourcePanel,
		},
	};
};
