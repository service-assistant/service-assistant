import { Buffer } from 'buffer';
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import EventSource, { EventSourceEvent } from 'react-native-sse';

import type { ChatMessageItem } from '@/components/ChatMessages';
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

type StreamEvent = 'chunk';

type AssistantMessagePayload = {
	id?: number;
	content?: string;
	image_url?: string | null;
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
	deviceId: number;
	currentThreadId: number | null;
	setCurrentThreadId: Dispatch<SetStateAction<number | null>>;
	setMessages: Dispatch<SetStateAction<TMessage[]>>;
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	setIsGenerating: Dispatch<SetStateAction<boolean>>;
	setCurrentImage: Dispatch<SetStateAction<string | null>>;
	playAssistantAudio: (text: string) => void | Promise<void>;
	onServiceError?: (featureName: string, error: unknown) => void;
	authTokenOverride?: string | null;
};

const fetchAuthorizedImageDataUrl = async (
	imageUrl: string,
	authToken: string,
	signal: AbortSignal,
) => {
	const response = await fetch(imageUrl, {
		headers: { Authorization: `Bearer ${authToken}` },
		signal,
	});

	if (!response.ok) {
		throwIfAuthResponseError(response);
		throw new Error(`Failed to load source image: ${response.status}`);
	}

	const contentType = response.headers.get('content-type') || 'image/png';
	const arrayBuffer = await response.arrayBuffer();
	const base64 = Buffer.from(arrayBuffer).toString('base64');

	return `data:${contentType};base64,${base64}`;
};

export const useChatApi = <TMessage extends ChatMessageItem>({
	serverUrl,
	deviceId,
	currentThreadId,
	setCurrentThreadId,
	setMessages,
	setIsLoading,
	setIsGenerating,
	setCurrentImage,
	playAssistantAudio,
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

			setMessages((prev) => [
				...prev,
				{ id: aiMessageId, sender: 'ai', text: '' } as TMessage,
			]);

			const abortController = new AbortController();
			fetchAbortControllerRef.current = abortController;

			try {
				const AUTH_TOKEN = authTokenOverride ?? getAuthTokenOrThrow();
				const activeThreadId = await ensureThread(question, abortController.signal);

				let fullText = '';
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
							body: JSON.stringify({ content: question }),
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
						}

						setMessages((prev) =>
							prev.map((msg) =>
								msg.id === aiMessageId
									? ({ ...msg, text: fullText } as TMessage)
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
							reject(new Error(`API server error: ${event.xhrStatus}`));
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
				let sourceAttachmentPage = 1;
				let imageUrls: string[] = [];

				if (systemMessageId) {
					const chunksResponse = await fetch(
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
						const chunkImagePaths = chunks.flatMap(
							(chunk) => chunk.metadata?.images || [],
						);
						const imageSourceChunk = chunks.find(
							(chunk) => (chunk.metadata?.images?.length || 0) > 0,
						);
						const sourceChunk = imageSourceChunk || chunks[0];

						if (sourceChunk?.attachment_id) {
							sourceAttachmentId = sourceChunk.attachment_id;
							sourceAttachmentPage = sourceChunk.metadata?.page || 1;

							if (!imageUrl && chunkImagePaths.length > 0) {
								const loadedImagePromisesByPath = new Map<
									string,
									Promise<string | null>
								>();
								const loadedImages = await Promise.all(
									chunkImagePaths.map((imagePath) => {
										const existingPromise =
											loadedImagePromisesByPath.get(imagePath);
										if (existingPromise) {
											return existingPromise;
										}

										const imagePromise = fetchAuthorizedImageDataUrl(
											buildChunkImageUrl(serverUrl, imagePath),
											AUTH_TOKEN,
											abortController.signal,
										).catch((error) => {
											if (abortController.signal.aborted) throw error;
											console.log('Handled source image load error:', error);
											return null;
										});
										loadedImagePromisesByPath.set(imagePath, imagePromise);
										return imagePromise;
									}),
								);

								imageUrls = loadedImages.filter(
									(url): url is string => typeof url === 'string',
								);
								imageUrl = imageUrls[0] || null;
							}

							imageUrl =
								imageUrl ||
								sourceChunk.metadata?.image_url ||
								sourceChunk.metadata?.schema_url ||
								null;

							const attachmentResponse = await fetch(
								`${serverUrl}/api/attachments/${sourceAttachmentId}`,
								{
									headers: {
										Accept: 'application/json',
										Authorization: `Bearer ${AUTH_TOKEN}`,
									},
									signal: abortController.signal,
								},
							);

							throwIfAuthResponseError(attachmentResponse);

							if (attachmentResponse.ok) {
								const attachment =
									(await attachmentResponse.json()) as AttachmentPayload;
								sourceAttachmentName =
									attachment.original_filename ||
									`Dokument_${sourceAttachmentId}.pdf`;
							} else {
								sourceAttachmentName = `Dokument_${sourceAttachmentId}.pdf`;
							}
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
									} as TMessage)
								: message,
						),
					);
				}

				if (imageUrl) {
					const nextImages = imageUrls.length > 0 ? imageUrls : [imageUrl];

					setCurrentImage(nextImages[0] || imageUrl);
					setMessages((prev) =>
						prev.map((message) =>
							message.id === aiMessageId
								? ({ ...message, schemaImage: imageUrl! } as TMessage)
								: message,
						),
					);
				} else if (sourceAttachmentId) {
					setCurrentImage(null);
				}

				if (!abortController.signal.aborted && fullText.length > 0) {
					playAssistantAudio(stripResponseDirectivesForSpeech(fullText));
				} else {
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
			ensureThread,
			playAssistantAudio,
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
