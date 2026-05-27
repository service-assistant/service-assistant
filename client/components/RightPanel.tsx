import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Animated,
	Image,
	Keyboard,
	PanResponder,
	Platform,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { Message } from './LeftPanel';
import PdfViewer from './PdfViewer';

const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';
const PRIMARY_ORANGE = '#FF7A00';
const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';

// --- INTERFACES ---

export interface PdfDocument {
	name: string;
	icon: string;
	color: string;
	source: { uri: string; headers?: Record<string, string> } | string | number;
	page: number;
}

export interface AvailableFile {
	id: number;
	name: string;
	icon: string;
	color: string;
	remoteUrl: string;
}

export interface RightPanelProps {
	currentSource: string;
	attachmentId: number | null;
	attachmentName: string;
	attachmentPage: number;
	availableFiles: AvailableFile[];
	isAvailableFilesLoading?: boolean;
	hasAskedQuestion: boolean;
	currentImage: string | null;
	currentImages?: string[];
	currentImageIndex?: number;
	onImageIndexChange?: (index: number) => void;
	isLoading: boolean;
	selectedPdf: PdfDocument | null;
	onSelectPdf: (pdf: PdfDocument | null) => void;
	showSchema: boolean;
	setShowSchema: (show: boolean) => void;
	setCurrentImage: (image: string | null) => void;
	isListening: boolean;
	onMicPress: () => void;
	soundLevelAnim: Animated.Value;
	isGenerating: boolean;
	onStop: () => void;
	messages?: Message[];
	isChatLoading?: boolean;
	showTextInput?: boolean;
	setShowTextInput?: (show: boolean) => void;
	inputText?: string;
	setInputText?: (text: string) => void;
	onSendText?: () => void;
	logoUrl?: string;
}

/**
 * RightPanel Component
 *
 * Responsible for rendering the document viewer, schema images, and the grid of available files.
 * Adapts its layout based on the screen width (Mobile vs. Desktop/Tablet).
 */
export default function RightPanel({
	currentSource,
	attachmentId,
	attachmentName,
	attachmentPage,
	availableFiles,
	isAvailableFilesLoading = false,
	hasAskedQuestion,
	currentImage,
	currentImages = [],
	currentImageIndex = 0,
	onImageIndexChange,
	isLoading: isApiLoading,
	selectedPdf,
	onSelectPdf,
	showSchema,
	setShowSchema,
	setCurrentImage,
	isListening,
	onMicPress,
	soundLevelAnim,
	isGenerating,
	onStop,
	messages = [],
	isChatLoading = false,
	showTextInput = false,
	setShowTextInput,
	inputText = '',
	setInputText,
	onSendText,
	logoUrl,
}: RightPanelProps) {
	const { width } = useWindowDimensions();
	const isMobile = width < 768;
	const router = useRouter();
	const insets = useSafeAreaInsets();

	const [isDownloading, setIsDownloading] = useState<boolean>(false);
	const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);
	const webPdfObjectUrlRef = useRef<string | null>(null);
	const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
	const [downloadedFileIds, setDownloadedFileIds] = useState<Set<number>>(new Set());
	const [isShowingFileGrid, setIsShowingFileGrid] = useState<boolean>(false);
	const [mobileMode, setMobileMode] = useState<'chat' | 'sources'>('chat');
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const imageFadeAnim = useRef(new Animated.Value(1)).current;
	const imageSlideAnim = useRef(new Animated.Value(0)).current;
	const previousImageIndexRef = useRef(currentImageIndex);
	const imageTransitionDirectionRef = useRef(1);
	const lastImageSwipeAtRef = useRef(0);
	const micState = isGenerating ? 'processing' : isListening ? 'listening' : 'idle';
	const micStyle =
		micState === 'processing'
			? {
					backgroundColor: 'rgba(46, 16, 101, 0.92)',
					borderColor: 'rgba(139, 92, 246, 0.9)',
					shadowColor: PROCESSING_VIOLET,
					shadowOpacity: 0.42,
					shadowRadius: 24,
					iconColor: '#FFFFFF',
					textColor: '#FFFFFF',
					label: 'PRZETWARZAM...',
				}
			: micState === 'listening'
				? {
						backgroundColor: 'rgba(8, 47, 73, 0.92)',
						borderColor: 'rgba(6, 182, 212, 0.9)',
						shadowColor: LISTENING_CYAN,
						shadowOpacity: 0.45,
						shadowRadius: 26,
						iconColor: '#FFFFFF',
						textColor: '#FFFFFF',
						label: 'SŁUCHAM...',
					}
				: {
						backgroundColor: 'rgba(34, 34, 38, 0.92)',
						borderColor: 'rgba(255, 122, 0, 0.3)',
						shadowColor: PRIMARY_ORANGE,
						shadowOpacity: 0.1,
						shadowRadius: 10,
						iconColor: '#E8E8E8',
						textColor: 'rgba(229, 231, 235, 0.78)',
						label: 'NACIŚNIJ ŻEBY MÓWIĆ',
					};

	const dynamicAttachmentId = attachmentId || 1;
	const dynamicPdfUrl = `https://staging.asystent-serwisanta.pl/api/attachments/${dynamicAttachmentId}/file`;
	const dynamicFileName = attachmentName || 'instrukcja_serwisowa.pdf';
	const sourcePdfFile =
		availableFiles.find((file) => file.id === dynamicAttachmentId) ||
		({
			id: dynamicAttachmentId,
			name: dynamicFileName,
			icon: 'file-pdf-box',
			color: '#EF4444',
			remoteUrl: dynamicPdfUrl,
		} satisfies AvailableFile);
	const isSourcePdfDownloaded = downloadedFileIds.has(sourcePdfFile.id);
	const isSourcePdfDownloading = isDownloading && downloadingFileId === sourcePdfFile.id;
	const hasMultipleImages = currentImages.length > 1;
	const currentImagePosition =
		currentImages.length > 0 ? Math.min(currentImageIndex + 1, currentImages.length) : 0;
	const imageTransitionStyle = {
		opacity: imageFadeAnim,
		transform: [{ translateX: imageSlideAnim }],
	};
	const mobileBottomInset = insets.bottom > 0 ? insets.bottom + 14 : 24;
	const bottomBar = {
		gap: 6,
		paddingHorizontal: 12,
		paddingVertical: 8,
		sideBtnSize: 58,
		centerBtnSize: 76,
		sideIconSize: 26,
		centerIconSize: 38,
		centerColumnWidth: 120,
	};
	const bottomBarBlurProps =
		Platform.OS === 'android'
			? ({
					intensity: 35,
					blurReductionFactor: 4,
					experimentalBlurMethod: 'dimezisBlurView',
				} as const)
			: { intensity: 40 };
	const mobileControlsHeight = bottomBar.centerBtnSize + bottomBar.paddingVertical * 2 + 56;
	const keyboardInputOffset = Platform.OS === 'ios' ? 56 : 72;
	const mobileControlsBottom =
		keyboardHeight > 0 ? keyboardHeight + keyboardInputOffset : mobileBottomInset;
	const isKeyboardTyping = showTextInput && keyboardHeight > 0;

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSubscription = Keyboard.addListener(showEvent, (event) => {
			setKeyboardHeight(event.endCoordinates.height);
		});
		const hideSubscription = Keyboard.addListener(hideEvent, () => {
			setKeyboardHeight(0);
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	useEffect(() => {
		return () => {
			if (webPdfObjectUrlRef.current && Platform.OS === 'web') {
				URL.revokeObjectURL(webPdfObjectUrlRef.current);
				webPdfObjectUrlRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		setIsShowingFileGrid(false);
	}, [currentImage]);

	useEffect(() => {
		const previousIndex = previousImageIndexRef.current;
		previousImageIndexRef.current = currentImageIndex;

		if (!currentImage || previousIndex === currentImageIndex) return;

		const direction = imageTransitionDirectionRef.current;

		imageFadeAnim.setValue(0);
		imageSlideAnim.setValue(direction * 42);

		Animated.parallel([
			Animated.timing(imageFadeAnim, {
				toValue: 1,
				duration: 220,
				useNativeDriver: true,
			}),
			Animated.spring(imageSlideAnim, {
				toValue: 0,
				speed: 22,
				bounciness: 5,
				useNativeDriver: true,
			}),
		]).start();
	}, [currentImage, currentImageIndex, imageFadeAnim, imageSlideAnim]);

	const showPreviousImage = useCallback(() => {
		if (!hasMultipleImages) return;
		const now = Date.now();
		if (now - lastImageSwipeAtRef.current < 360) return;
		lastImageSwipeAtRef.current = now;

		const nextIndex = currentImageIndex <= 0 ? currentImages.length - 1 : currentImageIndex - 1;
		imageTransitionDirectionRef.current = -1;
		onImageIndexChange?.(nextIndex);
	}, [currentImageIndex, currentImages.length, hasMultipleImages, onImageIndexChange]);

	const showNextImage = useCallback(() => {
		if (!hasMultipleImages) return;
		const now = Date.now();
		if (now - lastImageSwipeAtRef.current < 360) return;
		lastImageSwipeAtRef.current = now;

		const nextIndex = currentImageIndex >= currentImages.length - 1 ? 0 : currentImageIndex + 1;
		imageTransitionDirectionRef.current = 1;
		onImageIndexChange?.(nextIndex);
	}, [currentImageIndex, currentImages.length, hasMultipleImages, onImageIndexChange]);

	const imageSwipeResponder = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_, gestureState) =>
					hasMultipleImages &&
					Math.abs(gestureState.dx) > 24 &&
					Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2,
				onPanResponderRelease: (_, gestureState) => {
					if (gestureState.dx > 60) {
						showPreviousImage();
					} else if (gestureState.dx < -60) {
						showNextImage();
					}
				},
			}),
		[hasMultipleImages, showNextImage, showPreviousImage],
	);

	const handleImageWebViewMessage = useCallback(
		(event: any) => {
			if (event.nativeEvent.data === 'previous') {
				showPreviousImage();
			} else if (event.nativeEvent.data === 'next') {
				showNextImage();
			}
		},
		[showNextImage, showPreviousImage],
	);

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

	const deleteDownloadedFile = async (file: AvailableFile) => {
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
	};

	const getInvertedImageHtml = (imageUrl: string) => `
      <!DOCTYPE html>
      <html>
      <head>
         <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
         <style>
            html, body { width: 100%; min-height: 100%; margin: 0; padding: 0; background-color: #000000; overflow-x: hidden; overflow-y: auto; }
            img { display: block; width: 100%; height: auto; filter: invert(100%); }
         </style>
      </head>
      <body>
         <img src="${imageUrl}" />
         <script>
            let startX = 0;
            let startY = 0;
            document.addEventListener('touchstart', function(event) {
               const touch = event.changedTouches[0];
               startX = touch.clientX;
               startY = touch.clientY;
            }, { passive: true });
            document.addEventListener('touchend', function(event) {
               const touch = event.changedTouches[0];
               const dx = touch.clientX - startX;
               const dy = touch.clientY - startY;
               if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(dx > 0 ? 'previous' : 'next');
               }
            }, { passive: true });
         </script>
      </body>
      </html>
    `;

	/**
	 * Handles downloading a PDF file from a remote server.
	 * Functions differently on Web (passes URI directly) vs Native (downloads via FileSystem).
	 *
	 * @param remoteUrl - API endpoint to download from.
	 * @param localFilename - Desired filename for local storage.
	 * @param displayName - Name to display in the UI.
	 * @param fileIdForGrid - Associated file ID to display loading indicators correctly.
	 * @param targetPage - The page to open after the document is loaded.
	 */
	const performDownload = async (
		remoteUrl: string,
		localFilename: string,
		displayName: string,
		fileIdForGrid: number | null = null,
		targetPage: number = 1,
	) => {
		if (isDownloading) return;

		setIsDownloading(true);
		setDownloadingFileId(fileIdForGrid);

		try {
			if (Platform.OS === 'web') {
				if (webPdfObjectUrlRef.current) {
					URL.revokeObjectURL(webPdfObjectUrlRef.current);
					webPdfObjectUrlRef.current = null;
				}

				const response = await fetch(remoteUrl, {
					headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
				});

				if (!response.ok) {
					throw new Error(`PDF download failed: ${response.status}`);
				}

				const blob = await response.blob();
				const objectUrl = URL.createObjectURL(blob);
				webPdfObjectUrlRef.current = objectUrl;

				onSelectPdf({
					name: displayName,
					icon: 'file-download',
					color: '#22C55E',
					source: objectUrl,
					page: targetPage,
				});
				setShowSchema(false);
			} else {
				const fileUri = `${FileSystem.documentDirectory}${localFilename}`;

				downloadResumableRef.current = FileSystem.createDownloadResumable(
					remoteUrl,
					fileUri,
					{ headers: { Authorization: `Bearer ${AUTH_TOKEN}` } },
				);

				const result = await downloadResumableRef.current.downloadAsync();

				if (result && result.uri) {
					onSelectPdf({
						name: displayName,
						icon: 'file-download',
						color: '#22C55E',
						source: { uri: result.uri },
						page: targetPage,
					});
					setShowSchema(false);
				} else {
					throw new Error('Download failed - no URI');
				}
			}

			if (fileIdForGrid !== null) {
				setDownloadedFileIds((prev) => new Set(prev).add(fileIdForGrid));
			}
		} catch (e) {
			console.error('Download error:', e);
			Alert.alert('Błąd', `Nie udało się pobrać pliku: ${displayName}`);
		} finally {
			setIsDownloading(false);
			setDownloadingFileId(null);
			downloadResumableRef.current = null;
		}
	};

	/**
	 * Triggered when a file from the grid is selected.
	 */
	const handleFileGridPress = async (file: AvailableFile) => {
		const localFileUri = getLocalFileUri(file);

		if (downloadedFileIds.has(file.id) && localFileUri) {
			setIsShowingFileGrid(false);
			onSelectPdf({
				name: file.name,
				icon: 'file-download',
				color: '#22C55E',
				source: { uri: localFileUri },
				page: 1,
			});
			setShowSchema(false);
			return;
		}

		setIsShowingFileGrid(false);
		await performDownload(file.remoteUrl, getLocalFilename(file), file.name, file.id, 1);
	};

	const handleSourcePdfPress = async () => {
		const localFileUri = getLocalFileUri(sourcePdfFile);

		if (localFileUri) {
			const info = await FileSystem.getInfoAsync(localFileUri);

			if (info.exists) {
				setIsShowingFileGrid(false);
				setDownloadedFileIds((prev) => new Set(prev).add(sourcePdfFile.id));
				onSelectPdf({
					name: sourcePdfFile.name,
					icon: 'file-download',
					color: '#22C55E',
					source: { uri: localFileUri },
					page: attachmentPage || 1,
				});
				setShowSchema(false);
				return;
			}
		}

		setIsShowingFileGrid(false);
		await performDownload(
			sourcePdfFile.remoteUrl,
			getLocalFilename(sourcePdfFile),
			sourcePdfFile.name,
			sourcePdfFile.id,
			attachmentPage || 1,
		);
	};

	const renderFileGrid = (compact = false) => {
		if (isAvailableFilesLoading) {
			return (
				<View className='flex-1 items-center justify-center py-10'>
					<ActivityIndicator size='large' color={PRIMARY_ORANGE} />
				</View>
			);
		}

		if (availableFiles.length === 0) {
			return (
				<View className='flex-1 items-center justify-center py-10 px-4'>
					<Text className='text-neutral-500 text-center'>
						Brak plików dla tego urządzenia.
					</Text>
				</View>
			);
		}

		return (
			<View
				className={
					compact
						? 'flex-row flex-wrap justify-between gap-y-4'
						: 'flex-row flex-wrap justify-center gap-4 px-4'
				}>
				{availableFiles.map((file) => {
					const isThisFileDownloading = isDownloading && downloadingFileId === file.id;
					const isDownloaded = downloadedFileIds.has(file.id);

					return (
						<TouchableOpacity
							key={file.id}
							onPress={() => handleFileGridPress(file)}
							disabled={isDownloading}
							className={`${compact ? 'w-[48%] aspect-square p-5' : 'w-[30%] py-5 px-3'} border rounded-2xl items-center justify-center bg-[#141418] border-[#26262C] relative`}>
							{isDownloaded ? (
								<TouchableOpacity
									onPress={() => deleteDownloadedFile(file)}
									disabled={isDownloading}
									className='absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 border border-white/15 items-center justify-center z-10'>
									<Feather name='x' size={16} color='#C9CDD3' />
								</TouchableOpacity>
							) : null}

							<View className='w-20 h-20 items-center justify-center relative'>
								<MaterialCommunityIcons
									name={file.icon as any}
									size={compact ? 58 : 56}
									color={file.color}
									style={{ opacity: compact || isDownloaded ? 1 : 0.2 }}
								/>
								{compact || isDownloaded ? null : (
									<View className='absolute inset-0 items-center justify-center'>
										{isThisFileDownloading ? (
											<ActivityIndicator size='large' color='#fff' />
										) : (
											<Feather name='download-cloud' size={28} color='#fff' />
										)}
									</View>
								)}
							</View>

							{compact && isThisFileDownloading ? (
								<ActivityIndicator
									size='large'
									color={file.color}
									className='absolute'
								/>
							) : null}

							<Text
								className={`${compact ? 'text-xs mt-4' : 'text-[13px] mt-4 leading-4'} font-semibold text-center text-[#C9CDD3]`}
								numberOfLines={2}>
								{file.name}
							</Text>
						</TouchableOpacity>
					);
				})}
			</View>
		);
	};

	/**
	 * Renders the toggle button to switch between PDF viewer and Image Schema viewer.
	 */
	const renderSourceButton = () => {
		if (!currentImage) return null;

		return (
			<TouchableOpacity
				onPress={() => {
					if (isShowingFileGrid) {
						setIsShowingFileGrid(false);
						setShowSchema(true);
						return;
					}

					if (showSchema) {
						handleSourcePdfPress();
					} else {
						setShowSchema(true);
					}
				}}
				disabled={isDownloading}
				className={`flex-row items-center border ${isDownloading ? 'border-neutral-700 bg-neutral-900' : 'border-[#FF7A00]/40 bg-[#0a0a0a]'} px-4 py-3 rounded-md min-w-[170px] justify-center`}>
				{isSourcePdfDownloading ? (
					<View className='flex-row items-center'>
						<ActivityIndicator size='small' color='#fff' />
						<Text className='text-white font-bold ml-3 tracking-widest text-[11px] uppercase'>
							POBIERANIE...
						</Text>
					</View>
				) : (
					<View className='flex-row items-center'>
						<Feather
							name={showSchema && !isShowingFileGrid ? 'file-text' : 'layers'}
							size={18}
							color={PRIMARY_ORANGE}
						/>
						<Text className='text-[#FF7A00] font-bold ml-2 tracking-widest text-[11px] uppercase'>
							{isShowingFileGrid
								? 'POKAŻ SCHEMAT'
								: showSchema
									? isSourcePdfDownloaded
										? 'POKAŻ ŹRÓDŁO'
										: 'POBIERZ ŹRÓDŁO'
									: 'POKAŻ SCHEMAT'}
						</Text>
					</View>
				)}
			</TouchableOpacity>
		);
	};

	const renderImageCounter = () => {
		if (!hasMultipleImages) return null;

		return (
			<View className='absolute top-2 left-2 bg-black/80 border border-white/10 px-3 py-1.5 rounded-full z-10'>
				<Text className='text-white text-[11px] font-bold tracking-widest'>
					{currentImagePosition}/{currentImages.length}
				</Text>
			</View>
		);
	};

	const renderImageLayer = (
		imageUrl: string,
		style: object,
		pointerEvents: 'auto' | 'none' = 'auto',
	) => (
		<Animated.View pointerEvents={pointerEvents} style={[{ flex: 1 }, style]}>
			{Platform.OS === 'web' ? (
				<View
					style={{
						flex: 1,
						backgroundColor: '#000',
						alignItems: 'center',
						overflowY: 'auto',
					}}>
					<img
						src={imageUrl}
						style={{
							width: '100%',
							height: 'auto',
							filter: 'invert(100%)',
						}}
						alt='Schemat'
					/>
				</View>
			) : (
				<WebView
					source={{ html: getInvertedImageHtml(imageUrl) }}
					style={{ flex: 1, backgroundColor: 'transparent' }}
					scrollEnabled
					onMessage={handleImageWebViewMessage}
				/>
			)}
		</Animated.View>
	);

	const renderMobileSourceButton = () => {
		if (!currentImage && !attachmentId) return null;

		return (
			<TouchableOpacity
				onPress={() => {
					setMobileMode('sources');
					if (currentImage) {
						onSelectPdf(null);
						setIsShowingFileGrid(false);
						setShowSchema(true);
					} else {
						handleSourcePdfPress();
					}
				}}
				disabled={isDownloading}
				className='self-end mt-5 border border-[#FF7A00] px-6 py-3 flex-row items-center justify-center'
				style={{ minWidth: 190 }}>
				{isDownloading && downloadingFileId === null ? (
					<ActivityIndicator size='small' color={PRIMARY_ORANGE} />
				) : (
					<Feather name='link' size={22} color={PRIMARY_ORANGE} />
				)}
				<Text className='text-[#FF7A00] font-semibold ml-5 tracking-widest text-[13px] uppercase'>
					ŹRÓDŁO
				</Text>
			</TouchableOpacity>
		);
	};

	const renderMobileMessages = () => (
		<ScrollView
			className='flex-1'
			contentContainerStyle={{
				paddingTop: 18,
				paddingBottom: mobileControlsHeight + mobileBottomInset + 24,
			}}
			showsVerticalScrollIndicator={false}>
			{messages.map((msg, index) => {
				if (msg.sender === 'ai' && !msg.text) return null;
				const isLastAi = msg.sender === 'ai' && index === messages.length - 1;

				return msg.sender === 'ai' ? (
					<View
						key={msg.id}
						className='bg-[#202328] self-start rounded-[18px] px-4 py-3 mb-5'
						style={{
							maxWidth: '96%',
							borderTopLeftRadius: 18,
							borderBottomLeftRadius: 18,
							borderTopRightRadius: 18,
							borderBottomRightRadius: 18,
						}}>
						<Text className='text-[#D8DCE2] text-[17px] leading-[22px]'>
							{msg.text}
						</Text>
						{isLastAi ? renderMobileSourceButton() : null}
					</View>
				) : (
					<View
						key={msg.id}
						className='bg-[#B65000] self-end rounded-[18px] px-4 py-3 mb-5'
						style={{ maxWidth: '94%' }}>
						{msg.isSpeaking ? (
							<View className='py-1'>
								<MaterialCommunityIcons name='waveform' size={32} color='#FFFFFF' />
							</View>
						) : (
							<Text className='text-white text-[17px] leading-[22px]'>
								{msg.text}
							</Text>
						)}
					</View>
				);
			})}
			{isChatLoading ? (
				<View className='bg-[#202328] self-start rounded-[18px] px-4 py-3 mb-5 flex-row items-center'>
					<ActivityIndicator size='small' color={PRIMARY_ORANGE} />
					<Text className='text-[#D8DCE2] text-[14px] ml-3'>Przetwarzanie...</Text>
				</View>
			) : null}
		</ScrollView>
	);

	// --- MOBILE VIEW (FILES + CHAT) ---
	if (isMobile) {
		return (
			<SafeAreaView className='flex-1 bg-black' edges={['top', 'left', 'right']}>
				<View className='flex-1 bg-black px-4'>
					{/* Header */}
					<View className='flex-row justify-between items-center pt-3'>
						<TouchableOpacity
							onPress={() => router.push('/home')}
							className='border border-[#d35400] bg-black items-center justify-center'
							style={{ width: 46, height: 46 }}>
							<Feather name='arrow-left' size={26} color='#d35400' />
						</TouchableOpacity>

						<View
							className='flex-row items-center justify-center flex-1 px-2'
							style={{ minWidth: 0 }}>
							{logoUrl ? (
								<View style={{ width: 86, height: 24, marginRight: 8 }}>
									<Image
										source={{ uri: logoUrl }}
										style={{ width: '100%', height: '100%' }}
										resizeMode='contain'
									/>
								</View>
							) : null}
							<Text
								className='text-white font-semibold text-[14px]'
								style={{ flexShrink: 1, minWidth: 0 }}
								numberOfLines={1}
								adjustsFontSizeToFit>
								{currentSource}
							</Text>
						</View>

						<TouchableOpacity
							onPress={() =>
								setMobileMode((mode) => (mode === 'chat' ? 'sources' : 'chat'))
							}
							className='border border-[#d35400] bg-black items-center justify-center'
							style={{ width: 46, height: 46 }}>
							<Feather
								name={mobileMode === 'chat' ? 'link' : 'message-circle'}
								size={24}
								color='#d35400'
							/>
						</TouchableOpacity>
					</View>

					<View style={{ height: 16 }} />

					{/* Main Content: Files / Schema Section */}
					{mobileMode === 'chat' ? (
						renderMobileMessages()
					) : showSchema && currentImage ? (
						<View
							className='flex-1 mt-6 mb-4 rounded-xl overflow-hidden bg-black relative'
							{...imageSwipeResponder.panHandlers}>
							{renderImageLayer(currentImage, imageTransitionStyle)}
							{renderImageCounter()}
							<TouchableOpacity
								onPress={() => setShowSchema(false)}
								className='absolute top-2 right-2 bg-black/80 p-2 rounded-full z-10'>
								<Feather name='x' size={20} color='#fff' />
							</TouchableOpacity>
						</View>
					) : selectedPdf ? (
						<View className='flex-1 mt-6 mb-4 relative'>
							<PdfViewer
								source={selectedPdf?.source || require('../assets/instrukcje.pdf')}
								page={selectedPdf?.page || 1}
							/>
							<TouchableOpacity
								onPress={() => onSelectPdf(null)}
								className='absolute top-2 right-2 bg-black/80 p-2 rounded-full z-10'>
								<Feather name='x' size={20} color='#fff' />
							</TouchableOpacity>
						</View>
					) : (
						<ScrollView
							className='flex-1 mt-6 mb-4'
							contentContainerStyle={{
								flexGrow: 1,
								paddingBottom: mobileControlsHeight + mobileBottomInset + 24,
							}}
							showsVerticalScrollIndicator={false}>
							{renderFileGrid(true)}
						</ScrollView>
					)}

					{/* Bottom Bar: Chat / Mic Controls */}
					<View
						className='absolute left-0 right-0 items-center px-4'
						style={{ bottom: mobileControlsBottom }}>
						{showTextInput ? (
							<View
								className='flex-row w-full items-center gap-2'
								style={{ marginBottom: isKeyboardTyping ? 0 : 12 }}>
								<TextInput
									className='flex-1 bg-[#1A1A1D] border border-neutral-800 text-slate-200 px-4 py-3 rounded-xl text-[15px]'
									placeholder='Wpisz pytanie...'
									placeholderTextColor='#777'
									value={inputText}
									onChangeText={setInputText}
									onSubmitEditing={onSendText}
									autoFocus
								/>
								<TouchableOpacity
									className='bg-[#CC5500] w-[48px] h-[48px] rounded-xl items-center justify-center'
									onPress={onSendText}>
									<Feather name='send' size={19} color='white' />
								</TouchableOpacity>
							</View>
						) : null}

						<BlurView
							{...bottomBarBlurProps}
							tint='dark'
							className='flex-row items-center justify-center overflow-hidden'
							style={{
								borderRadius: 100,
								borderWidth: 1,
								borderColor: 'rgba(255, 122, 0, 0.18)',
								paddingHorizontal: bottomBar.paddingHorizontal,
								paddingVertical: bottomBar.paddingVertical,
								gap: bottomBar.gap,
								shadowColor: '#000',
								shadowOffset: { width: 0, height: 12 },
								shadowOpacity: 0.45,
								shadowRadius: 36,
								elevation: 12,
								display: isKeyboardTyping ? 'none' : 'flex',
								backgroundColor:
									Platform.OS === 'android'
										? 'rgba(18, 18, 22, 0.82)'
										: 'rgba(24, 24, 28, 0.76)',
							}}>
							<TouchableOpacity
								className='rounded-[12px] items-center justify-center'
								style={{
									width: bottomBar.sideBtnSize,
									height: bottomBar.sideBtnSize,
									backgroundColor: 'rgba(31, 31, 36, 0.88)',
									borderWidth: 1,
									borderColor: 'rgba(255, 255, 255, 0.08)',
								}}>
								<Image
									source={require('../assets/images/camera.png')}
									style={{
										width: bottomBar.sideIconSize,
										height: bottomBar.sideIconSize,
										tintColor: '#D4D4D8',
									}}
									resizeMode='contain'
								/>
							</TouchableOpacity>

							<View
								className='items-center flex-col gap-2'
								style={{ width: bottomBar.centerColumnWidth }}>
								<TouchableOpacity
									onPress={isGenerating ? onStop : onMicPress}
									className='rounded-[12px] items-center justify-center'
									style={{
										width: bottomBar.centerBtnSize,
										height: bottomBar.centerBtnSize,
										backgroundColor: micStyle.backgroundColor,
										borderWidth: 1,
										borderColor: micStyle.borderColor,
										shadowColor: micStyle.shadowColor,
										shadowOffset: { width: 0, height: 0 },
										shadowOpacity: micStyle.shadowOpacity,
										shadowRadius: micStyle.shadowRadius,
										elevation: micState === 'idle' ? 5 : 10,
									}}>
									{isListening && !isGenerating ? (
										<Animated.View
											pointerEvents='none'
											style={{
												position: 'absolute',
												top: 0,
												bottom: 0,
												left: 0,
												right: 0,
												borderRadius: 12,
												borderWidth: 1,
												borderColor: LISTENING_CYAN,
												backgroundColor: 'rgba(6, 182, 212, 0.14)',
												opacity: 0.45,
												transform: [{ scale: soundLevelAnim }],
											}}
										/>
									) : null}
									{isGenerating ? (
										<MaterialCommunityIcons
											name='stop'
											size={bottomBar.centerIconSize}
											color={micStyle.iconColor}
										/>
									) : (
										<Image
											source={require('../assets/images/micro.png')}
											style={{
												width: bottomBar.centerIconSize,
												height: bottomBar.centerIconSize,
												tintColor: micStyle.iconColor,
											}}
											resizeMode='contain'
										/>
									)}
								</TouchableOpacity>
								<View className='flex-row items-center justify-center mt-1'>
									{isListening && !isGenerating ? (
										<View
											className='w-1.5 h-1.5 rounded-full mr-2'
											style={{ backgroundColor: LISTENING_CYAN }}
										/>
									) : null}
									<Text
										className='text-center text-[11px] font-bold'
										style={{
											letterSpacing: 0.8,
											color: micStyle.textColor,
											textShadowColor: 'rgba(0, 0, 0, 0.8)',
											textShadowOffset: { width: 0, height: 1 },
											textShadowRadius: 3,
										}}
										numberOfLines={1}
										adjustsFontSizeToFit>
										{micStyle.label}
									</Text>
								</View>
							</View>

							<TouchableOpacity
								onPress={() => setShowTextInput?.(!showTextInput)}
								className='rounded-[12px] items-center justify-center'
								style={{
									width: bottomBar.sideBtnSize,
									height: bottomBar.sideBtnSize,
									backgroundColor: 'rgba(31, 31, 36, 0.88)',
									borderWidth: 1,
									borderColor: 'rgba(255, 255, 255, 0.08)',
								}}>
								<Image
									source={require('../assets/images/writing.png')}
									style={{
										width: bottomBar.sideIconSize,
										height: bottomBar.sideIconSize,
										tintColor: showTextInput ? PRIMARY_ORANGE : '#D4D4D8',
									}}
									resizeMode='contain'
								/>
							</TouchableOpacity>
						</BlurView>
					</View>
				</View>
			</SafeAreaView>
		);
	}

	// --- DESKTOP / TABLET VIEW ---
	return (
		<View className='flex-1 h-full flex-col pl-6'>
			{/* Top Toolbar */}
			<View className='w-full flex-row items-center mb-4 h-14'>
				<View className='flex-1' />
				<View className='flex-1 flex-row justify-end gap-3'>
					<TouchableOpacity
						onPress={() => {
							if (downloadResumableRef.current) {
								downloadResumableRef.current.cancelAsync();
							}
							onSelectPdf(null);
							setShowSchema(false);
							setIsShowingFileGrid(true);
							setIsDownloading(false);
							setDownloadingFileId(null);
						}}
						disabled={isDownloading}
						className={`flex-row items-center border ${isDownloading ? 'border-neutral-700' : 'border-[#FF7A00]/40'} px-4 py-3 rounded-md bg-[#0a0a0a]`}>
						<MaterialCommunityIcons
							name='file-tree'
							size={18}
							color={isDownloading ? '#555' : PRIMARY_ORANGE}
						/>
						<Text
							className={`${isDownloading ? 'text-neutral-600' : 'text-[#FF7A00]'} font-bold ml-2 tracking-widest text-[11px] uppercase`}>
							POKAŻ PLIKI
						</Text>
					</TouchableOpacity>

					{renderSourceButton()}
				</View>
			</View>

			{/* Main Content View */}
			<View className='flex-1 rounded-xl overflow-hidden bg-black'>
				{isShowingFileGrid ? (
					<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
						{renderFileGrid()}
					</ScrollView>
				) : currentImage && showSchema ? (
					<View className='flex-1 relative' {...imageSwipeResponder.panHandlers}>
						{renderImageLayer(currentImage, imageTransitionStyle)}
						{renderImageCounter()}
					</View>
				) : selectedPdf ? (
					<View className='flex-1 relative'>
						<PdfViewer
							source={selectedPdf?.source || require('../assets/instrukcje.pdf')}
							page={selectedPdf?.page || 1}
						/>
						<View className='absolute top-0 left-0 bg-[#121212] border border-neutral-800 px-3 py-2 rounded-br-lg flex-row items-center shadow-lg opacity-90 z-10'>
							<MaterialCommunityIcons
								name={(selectedPdf?.icon as any) || 'file-pdf-box'}
								size={18}
								color={selectedPdf?.color || '#EF4444'}
							/>
							<Text className='text-slate-200 text-[11px] font-bold ml-2 tracking-widest uppercase'>
								{selectedPdf?.name || 'Dokument.pdf'}
							</Text>
						</View>
					</View>
				) : (
					<ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
						{renderFileGrid()}
					</ScrollView>
				)}
			</View>
		</View>
	);
}
