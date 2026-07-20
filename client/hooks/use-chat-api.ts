import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import EventSource, { EventSourceEvent } from 'react-native-sse';

import type {
	ChatMessageItem,
	ChatMessageSourceReference,
	SchemaImageSource,
} from '@/components/ChatMessages';
import { stripResponseDirectivesForSpeech } from '@/components/ChatMessages';
import { AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	AUTH_SERVICE_FEATURE,
	createInvalidAuthTokenError,
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';
import { buildChunkImageUrl, formatStreamingText, parseStreamData } from '@/utils/chat-stream';
import { fetchWithRetry, HttpError, isTransientNetworkError } from '@/utils/network';

const MAX_SCHEMA_IMAGES = 5;

type StreamEvent = 'chunk';

type AssistantMessagePayload = {
	id?: number;
	content?: string;
	image_url?: string | null;
	has_continuation?: boolean;
};

type SourceChunkPayload = {
	attachment_id: number;
	metadata?: {
		images?: string[];
		image_url?: string;
		page?: number;
		schema_url?: string;
	} | null;
};

type AttachmentPayload = {
	id?: number;
	original_filename?: string;
};

type UseChatApiParams<TMessage extends ChatMessageItem> = {
	serverUrl: string;
	deviceId: number | null;
	currentThreadId: number | null;
	setCurrentThreadId: Dispatch<SetStateAction<number | null>>;
	setMessages: Dispatch<SetStateAction<TMessage[]>>;
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	setIsGenerating: Dispatch<SetStateAction<boolean>>;
	setCurrentImage: Dispatch<SetStateAction<SchemaImageSource | null>>;
	diagnosticMode2002Enabled?: boolean;
	playAssistantAudio: (text: string) => void | Promise<void>;
	ttsEnabled?: boolean;
	onServiceError?: (featureName: string, error: unknown) => void;
	authTokenOverride?: string | null;
};

const createAuthorizedImageSource = (imageUrl: string, authToken: string): SchemaImageSource => ({
	uri: imageUrl,
	headers: { Authorization: `Bearer ${authToken}` },
});

const getSchemaImageKey = (source: SchemaImageSource) =>
	typeof source === 'string' ? source : source.uri;

export const useChatApi = <TMessage extends ChatMessageItem>({
	serverUrl,
	deviceId,
	currentThreadId,
	setCurrentThreadId,
	setMessages,
	setIsLoading,
	setIsGenerating,
	setCurrentImage,
	diagnosticMode2002Enabled = true,
	playAssistantAudio,
	ttsEnabled = true,
	onServiceError,
	authTokenOverride,
}: UseChatApiParams<TMessage>) => {
	const fetchAbortControllerRef = useRef<AbortController | null>(null);
	const currentThreadIdRef = useRef<number | null>(currentThreadId);

	useEffect(() => {
		currentThreadIdRef.current = currentThreadId;
	}, [currentThreadId]);

	const stopChatApi = useCallback(() => {
		if (fetchAbortControllerRef.current) {
			fetchAbortControllerRef.current.abort();
			fetchAbortControllerRef.current = null;
		}
		setIsGenerating(false);
		setIsLoading(false);
		setMessages((prev) =>
			prev.filter((message) => message.sender !== 'ai' || message.text.length > 0),
		);
	}, [setIsGenerating, setIsLoading, setMessages]);

	useEffect(() => () => stopChatApi(), [stopChatApi]);

	const ensureThread = useCallback(
		async (titleSource: string, signal?: AbortSignal) => {
			if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
			const AUTH_TOKEN = authTokenOverride ?? getAuthTokenOrThrow();
			const activeThreadId = currentThreadIdRef.current;

			if (activeThreadId) return activeThreadId;
			if (!deviceId) {
				throw new Error('Cannot create a chat thread without a selected device.');
			}

			const threadResponse = await fetch(`${serverUrl}/api/threads`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${AUTH_TOKEN}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					device_id: deviceId,
					title:
						titleSource.length > 40
							? `${titleSource.substring(0, 40)}...`
							: titleSource,
				}),
				signal,
			});

			if (!threadResponse.ok) {
				throwIfAuthResponseError(threadResponse);
				throw new Error('Failed to create a new thread.');
			}

			const threadData = await threadResponse.json();
			const createdThreadId = Number(threadData.id);
			if (!Number.isFinite(createdThreadId)) {
				throw new Error('Failed to create a new thread.');
			}

			currentThreadIdRef.current = createdThreadId;
			setCurrentThreadId(createdThreadId);

			return createdThreadId;
		},
		[authTokenOverride, deviceId, serverUrl, setCurrentThreadId],
	);

	const askAPI = useCallback(
		async (question: string) => {
			setIsLoading(true);
			setIsGenerating(true);
			const aiMessageId = Date.now() + Math.random();
			let fullText = '';
			let hasContinuation = false;

			setMessages((prev) => [
				...prev,
				{ id: aiMessageId, sender: 'ai', text: '' } as TMessage,
			]);

			const abortController = new AbortController();
			fetchAbortControllerRef.current = abortController;

			try {
				const AUTH_TOKEN = authTokenOverride ?? getAuthTokenOrThrow();
				const activeThreadId = await ensureThread(question, abortController.signal);

				let imageUrl: string | null = null;
				let systemMessageId: number | null = null;

				await new Promise<void>((resolve, reject) => {
					const eventSource = new EventSource<StreamEvent>(
						`${serverUrl}/api/threads/${activeThreadId}/messages`,
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Accept: 'text/event-stream',
								Authorization: `Bearer ${AUTH_TOKEN}`,
							},
							body: JSON.stringify({
								content: question,
								diagnostic_mode_2002: diagnosticMode2002Enabled,
							}),
							pollingInterval: 0,
							timeoutBeforeConnection: 0,
						},
					);

					const closeStream = () => {
						eventSource.close();
						abortController.signal.removeEventListener('abort', handleAbort);
					};

					const handleAbort = () => {
						closeStream();
						resolve();
					};

					const handleChunk = (event: EventSourceEvent<StreamEvent>) => {
						const chunkText = event.data === '' ? '\n' : (event.data ?? '');

						if (abortController.signal.aborted) return;

						fullText += chunkText;
						const displayText = formatStreamingText(fullText);
						setIsLoading(false);
						setMessages((prev) =>
							prev.map((message) =>
								message.id === aiMessageId
									? ({ ...message, text: displayText } as TMessage)
									: message,
							),
						);
					};

					const handleMessage = (event: EventSourceEvent<'message'>) => {
						const message = parseStreamData<AssistantMessagePayload>(event.data);

						if (typeof message === 'object' && message !== null) {
							fullText = message.content || fullText;
							imageUrl = message.image_url || null;
							systemMessageId = message.id || null;
							hasContinuation = message.has_continuation === true;
						}

						setMessages((prev) =>
							prev.map((msg) =>
								msg.id === aiMessageId
									? ({ ...msg, text: fullText, hasContinuation } as TMessage)
									: msg,
							),
						);

						closeStream();
						resolve();
					};

					const handleError = (event: EventSourceEvent<'error'>) => {
						closeStream();

						if (abortController.signal.aborted) {
							resolve();
							return;
						}

						if ('xhrStatus' in event) {
							const status = Number(event.xhrStatus);
							if (status === 401 || status === 403) {
								reject(createInvalidAuthTokenError(status));
								return;
							}
							if (!Number.isFinite(status) || status === 0) {
								reject(
									new TypeError('Network connection lost during response stream'),
								);
								return;
							}
							reject(new HttpError(status, `API server error: ${status}`));
						} else if ('message' in event) {
							reject(new Error(event.message));
						} else {
							reject(new Error('SSE stream error'));
						}
					};

					abortController.signal.addEventListener('abort', handleAbort);
					eventSource.addEventListener('chunk', handleChunk);
					eventSource.addEventListener('message', handleMessage);
					eventSource.addEventListener('error', handleError);
				});

				if (abortController.signal.aborted) {
					if (fullText.length === 0) {
						setMessages((prev) => prev.filter((message) => message.id !== aiMessageId));
					}
					setIsGenerating(false);
					return;
				}

				let sourceAttachmentId: number | null = null;
				let sourceAttachmentName = '';
				let sourceAttachmentPage = 0;
				let sourceReferences: ChatMessageSourceReference[] = [];
				let schemaImages: SchemaImageSource[] = [];
				let hasStartedAssistantAudio = false;

				const startAssistantAudio = () => {
					if (
						!ttsEnabled ||
						hasStartedAssistantAudio ||
						abortController.signal.aborted ||
						fullText.length === 0
					) {
						return;
					}

					hasStartedAssistantAudio = true;
					playAssistantAudio(stripResponseDirectivesForSpeech(fullText));
				};

				const applySchemaImages = (nextImageUrls: SchemaImageSource[]) => {
					schemaImages = nextImageUrls
						.filter(
							(source, index, sources) =>
								sources.findIndex(
									(candidate) =>
										getSchemaImageKey(candidate) === getSchemaImageKey(source),
								) === index,
						)
						.slice(0, MAX_SCHEMA_IMAGES);
					if (schemaImages.length === 0) return;

					setCurrentImage(schemaImages[0]);
					setMessages((prev) =>
						prev.map((message) =>
							message.id === aiMessageId
								? ({
										...message,
										schemaImage: schemaImages[0],
										schemaImages,
									} as TMessage)
								: message,
						),
					);
					startAssistantAudio();
				};

				if (imageUrl) {
					applySchemaImages([imageUrl]);
				}

				if (systemMessageId) {
					const chunksResponse = await fetchWithRetry(
						`${serverUrl}/api/messages/${systemMessageId}/chunks`,
						{
							headers: {
								Accept: 'application/json',
								Authorization: `Bearer ${AUTH_TOKEN}`,
							},
							signal: abortController.signal,
						},
					);

					throwIfAuthResponseError(chunksResponse);

					if (chunksResponse.ok) {
						const chunks = (await chunksResponse.json()) as SourceChunkPayload[];
						const chunkImageEntries = chunks.flatMap((chunk) =>
							(chunk.metadata?.images || []).map((path) => ({ chunk, path })),
						);
						const imageSourceChunk = chunks.find(
							(chunk) => (chunk.metadata?.images?.length || 0) > 0,
						);
						const sourceChunk = imageSourceChunk || chunks[0];

						if (sourceChunk?.attachment_id) {
							sourceAttachmentId = sourceChunk.attachment_id;
							sourceAttachmentPage = sourceChunk.metadata?.page ?? 0;

							imageUrl =
								imageUrl ||
								sourceChunk.metadata?.image_url ||
								sourceChunk.metadata?.schema_url ||
								null;

							if (imageUrl && schemaImages.length === 0) {
								applySchemaImages([imageUrl]);
							}

							const uniqueImageEntries = chunkImageEntries
								.filter(
									(entry, index, entries) =>
										entries.findIndex(
											(candidate) => candidate.path === entry.path,
										) === index,
								)
								.slice(0, MAX_SCHEMA_IMAGES - schemaImages.length);
							let loadedImageEntries: {
								chunk: SourceChunkPayload;
								url: SchemaImageSource;
							}[] = [];

							if (uniqueImageEntries.length > 0) {
								// Pass authenticated URLs directly to the native image loader. This
								// avoids downloading every file into JS, duplicating it as base64 and
								// blocking the answer until all conversions have completed.
								loadedImageEntries = uniqueImageEntries.map(({ chunk, path }) => ({
									chunk,
									url: createAuthorizedImageSource(
										buildChunkImageUrl(serverUrl, path),
										AUTH_TOKEN,
									),
								}));
								applySchemaImages([
									...schemaImages,
									...loadedImageEntries.map((entry) => entry.url),
								]);
							}

							const sourceChunks = chunks
								.filter(
									(chunk, index, allChunks) =>
										allChunks.findIndex(
											(candidate) =>
												candidate.attachment_id === chunk.attachment_id &&
												(candidate.metadata?.page ?? 0) ===
													(chunk.metadata?.page ?? 0),
										) === index,
								)
								.slice(0, MAX_SCHEMA_IMAGES);
							const attachmentIds = Array.from(
								new Set(sourceChunks.map((chunk) => chunk.attachment_id)),
							);
							const attachmentEntries = await Promise.all(
								attachmentIds.map(async (attachmentId) => {
									const attachmentResponse = await fetchWithRetry(
										`${serverUrl}/api/attachments/${attachmentId}`,
										{
											headers: {
												Accept: 'application/json',
												Authorization: `Bearer ${AUTH_TOKEN}`,
											},
											signal: abortController.signal,
										},
									);

									throwIfAuthResponseError(attachmentResponse);
									if (!attachmentResponse.ok) {
										return [
											attachmentId,
											`Dokument_${attachmentId}.pdf`,
										] as const;
									}

									const attachment =
										(await attachmentResponse.json()) as AttachmentPayload;
									return [
										attachmentId,
										attachment.original_filename ||
											`Dokument_${attachmentId}.pdf`,
									] as const;
								}),
							);
							const attachmentNames = new Map(attachmentEntries);
							sourceReferences = sourceChunks.map((chunk) => ({
								sourceAttachmentId: chunk.attachment_id,
								sourceAttachmentName: attachmentNames.get(chunk.attachment_id),
								sourceAttachmentPage: chunk.metadata?.page ?? 0,
								previewImage:
									loadedImageEntries.find(
										(entry) =>
											entry.chunk.attachment_id === chunk.attachment_id &&
											(entry.chunk.metadata?.page ?? 0) ===
												(chunk.metadata?.page ?? 0),
									)?.url || (chunk === sourceChunk ? schemaImages[0] : undefined),
							}));
							sourceAttachmentName =
								attachmentNames.get(sourceAttachmentId) ||
								`Dokument_${sourceAttachmentId}.pdf`;
						}
					}
				}

				if (sourceAttachmentId) {
					setMessages((prev) =>
						prev.map((message) =>
							message.id === aiMessageId
								? ({
										...message,
										sourceAttachmentId,
										sourceAttachmentName:
											sourceAttachmentName ||
											`Dokument_${sourceAttachmentId}.pdf`,
										sourceAttachmentPage,
										sourceReferences,
									} as TMessage)
								: message,
						),
					);
				}

				if (schemaImages.length === 0 && sourceAttachmentId) {
					setCurrentImage(null);
				}

				startAssistantAudio();
				if (!hasStartedAssistantAudio) {
					setIsGenerating(false);
				}
			} catch (error: any) {
				if (error.name === 'AbortError') {
					console.log('Request aborted by the user.');
					setMessages((prev) =>
						prev.filter(
							(message) => message.id !== aiMessageId || message.text.length > 0,
						),
					);
				} else {
					const serviceFeature = getServiceErrorFeature(error, 'odpowiedź asystenta');
					onServiceError?.(serviceFeature, error);

					if (serviceFeature === AUTH_SERVICE_FEATURE) {
						setMessages((prev) => prev.filter((message) => message.id !== aiMessageId));
					} else if (isTransientNetworkError(error)) {
						setMessages((prev) =>
							prev.map((message) =>
								message.id === aiMessageId
									? ({
											...message,
											text:
												message.text ||
												fullText ||
												'Połączenie zostało przerwane. Spróbuj wysłać pytanie ponownie.',
											retryQuestion: question,
										} as TMessage)
									: message,
							),
						);
					} else {
						setMessages((prev) =>
							prev.map((message) =>
								message.id === aiMessageId
									? ({
											...message,
											text: 'Wystąpił błąd komunikacji. Spróbuj ponownie później.',
										} as TMessage)
									: message,
							),
						);
					}
				}
				setIsGenerating(false);
			} finally {
				setIsLoading(false);
				if (fetchAbortControllerRef.current === abortController) {
					fetchAbortControllerRef.current = null;
				}
			}
		},
		[
			authTokenOverride,
			diagnosticMode2002Enabled,
			ensureThread,
			playAssistantAudio,
			ttsEnabled,
			onServiceError,
			serverUrl,
			setCurrentImage,
			setIsGenerating,
			setIsLoading,
			setMessages,
		],
	);

	return {
		askAPI,
		ensureThread,
		stopChatApi,
	};
};
