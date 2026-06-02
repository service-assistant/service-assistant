import { Buffer } from 'buffer';
import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, useWindowDimensions, View } from 'react-native';
import EventSource, { EventSourceEvent } from 'react-native-sse';

import LeftPanel, { Message } from '@/components/LeftPanel';
import RightPanel, { AvailableFile } from '@/components/RightPanel';
import { useWakeWord } from '@/hooks/use-wake-word';
import * as FileSystem from 'expo-file-system/legacy';

const SERVER_URL = 'https://staging.asystent-serwisanta.pl';

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

type DeviceAttachmentPayload = {
	id: number;
	original_filename: string;
};

type ThreadMessagePayload = {
	id: number;
	content: string;
	sender: 'user' | 'system';
};

const HARDCODED_DEVICE_ID = 1;
const MIN_RECORDING_DURATION_MS = 500;
const MIC_RESTART_COOLDOWN_MS = 500;
const SHORT_MIC_PROCESSING_DURATION_MS = 2000;

const FILE_ICON_OPTIONS = [
	{ icon: 'file-pdf-box', color: '#EF4444' },
	{ icon: 'file-document-outline', color: '#06B6D4' },
	{ icon: 'lightning-bolt', color: '#EAB308' },
	{ icon: 'cogs', color: '#A855F7' },
	{ icon: 'wrench-outline', color: '#3B82F6' },
	{ icon: 'shield-check-outline', color: '#22C55E' },
];

const parseStreamData = <T,>(data: string | null): T | string => {
	if (!data) return '';

	try {
		return JSON.parse(data) as T;
	} catch {
		return data;
	}
};

const buildChunkImageUrl = (imagePath: string) =>
	`${SERVER_URL}/api/images/${encodeURIComponent(imagePath)}`;

const formatStreamingText = (text: string) => {
	let result = '';
	let cursor = 0;
	let lastListNumber: number | null = null;
	const markerPattern = /\d+[\.)]\s+/g;
	let match: RegExpExecArray | null;

	while ((match = markerPattern.exec(text)) !== null) {
		const markerStart = match.index;
		const markerNumber = Number.parseInt(match[0], 10);
		const previousChar = markerStart > 0 ? text[markerStart - 1] : '';
		const textSinceCursor = text.slice(cursor, markerStart);
		const canStartList =
			lastListNumber === null &&
			!/\d/.test(previousChar) &&
			textSinceCursor.trimEnd().endsWith(':');
		const canContinueList =
			lastListNumber !== null &&
			!/\d/.test(previousChar) &&
			markerNumber === lastListNumber + 1;

		if (!canStartList && !canContinueList) {
			continue;
		}

		result += textSinceCursor.trimEnd();
		if (!result.endsWith('\n')) {
			result += '\n';
		}
		cursor = markerStart;
		lastListNumber = markerNumber;
	}

	return result + text.slice(cursor);
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
		throw new Error(`Failed to load source image: ${response.status}`);
	}

	const contentType = response.headers.get('content-type') || 'image/png';
	const arrayBuffer = await response.arrayBuffer();
	const base64 = Buffer.from(arrayBuffer).toString('base64');

	return `data:${contentType};base64,${base64}`;
};

/**
 * ChatScreen Component
 *
 * Handles the main conversational interface, supporting both text and voice interactions.
 * Features include:
 * - Real-time voice recording with volume metering
 * - Integration with Deepgram for Speech-to-Text (STT)
 * - Integration with OpenAI for Text-to-Speech (TTS)
 * - Managing thread-based conversation history with the backend API
 * - Displaying attachments and schema images
 */
export default function ChatScreen() {
	const { width } = useWindowDimensions();
	const isMobile = width < 768;

	// --- ROUTING PARAMETERS ---
	const { deviceId, deviceName, logoUrl, chatSession, threadId } = useLocalSearchParams<{
		deviceId: string;
		deviceName: string;
		logoUrl: string;
		chatSession: string;
		threadId?: string;
	}>();
	const sessionKey = `${deviceId ?? ''}:${chatSession ?? ''}:${threadId ?? ''}`;

	// --- UI & DATA STATES ---
	const [showSchema, setShowSchema] = useState<boolean>(true);
	const [selectedPdf, setSelectedPdf] = useState<any>(null);
	const [isListening, setIsListening] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
	const [isAvailableFilesLoading, setIsAvailableFilesLoading] = useState<boolean>(true);

	// --- STOP CONTROL STATES ---
	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
	const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
	const [isMicRestartBlocked, setIsMicRestartBlocked] = useState<boolean>(false);

	const [showTextInput, setShowTextInput] = useState<boolean>(false);
	const [inputText, setInputText] = useState<string>('');
	const [currentImage, setCurrentImage] = useState<string | null>(null);
	const [currentImages, setCurrentImages] = useState<string[]>([]);
	const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
	const [attachmentPage, setAttachmentPage] = useState<number>(1);

	const [attachmentId, setAttachmentId] = useState<number | null>(null);
	const [attachmentName, setAttachmentName] = useState<string>('');

	// --- CHAT & THREAD STATE ---
	const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
	const [currentSource, setCurrentSource] = useState<string>(deviceName || 'Wybierz maszynę');

	const initialMessage = 'Cześć. Jestem gotowy. Zadaj pytanie o naprawę lub zgłoś usterkę.';
	const [messages, setMessages] = useState<Message[]>([
		{ id: 1, sender: 'ai', text: initialMessage },
	]);

	// --- AUDIO & RECORDING ---
	const ttsPlayer = useAudioPlayer(null);
	const audioRecorder = useAudioRecorder({
		...RecordingPresets.HIGH_QUALITY,
		isMeteringEnabled: true,
	});

	// --- LOGIC REFERENCES ---
	const userSpeakingMessageIdRef = useRef<number>(0);
	const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const soundLevelAnim = useRef(new Animated.Value(0.2)).current;
	const lastLoudTime = useRef<number>(0);
	const hasSpoken = useRef<boolean>(false);

	// --- REQUEST CANCELLATION REFERENCES ---
	const fetchAbortControllerRef = useRef<AbortController | null>(null);
	const ttsAbortControllerRef = useRef<AbortController | null>(null);
	const sttAbortControllerRef = useRef<AbortController | null>(null);
	const handleMicPressRef = useRef<() => Promise<void>>(async () => undefined);
	const isStartingRecordingRef = useRef<boolean>(false);
	const isStoppingRecordingRef = useRef<boolean>(false);
	const shouldStopAfterStartRef = useRef<boolean>(false);
	const recordingStartedAtRef = useRef<number | null>(null);
	const micRestartBlockedUntilRef = useRef<number>(0);
	const micRestartCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const wasMicProcessingRef = useRef<boolean>(false);
	const micProcessingStartedAtRef = useRef<number | null>(null);

	// --- SILENCE CONFIGURATION ---
	const silenceThreshold = -50;
	const silenceDuration = 2500;
	const initialSilenceDuration = 5000;

	/**
	 * Initialize audio module settings and cleanup on unmount
	 */
	useEffect(() => {
		AudioModule.setAudioModeAsync({
			playsInSilentMode: true,
			allowsRecording: true,
		});

		return () => {
			if (meteringIntervalRef.current) clearInterval(meteringIntervalRef.current);
			if (fetchAbortControllerRef.current) fetchAbortControllerRef.current.abort();
			if (ttsAbortControllerRef.current) ttsAbortControllerRef.current.abort();
			if (sttAbortControllerRef.current) sttAbortControllerRef.current.abort();
			if (micRestartCooldownTimeoutRef.current) {
				clearTimeout(micRestartCooldownTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (deviceName) {
			setCurrentSource(deviceName);
		}
	}, [deviceName]);

	useEffect(() => {
		const abortController = new AbortController();
		const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';

		const fetchAvailableFiles = async () => {
			setIsAvailableFilesLoading(true);

			try {
				const response = await fetch(
					`${SERVER_URL}/api/devices/${HARDCODED_DEVICE_ID}/attachments`,
					{
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${AUTH_TOKEN}`,
						},
						signal: abortController.signal,
					},
				);

				if (!response.ok) {
					throw new Error(`Failed to load attachments: ${response.status}`);
				}

				const attachments = (await response.json()) as DeviceAttachmentPayload[];
				setAvailableFiles(
					attachments.map((attachment, index) => {
						const iconOption = FILE_ICON_OPTIONS[index % FILE_ICON_OPTIONS.length];

						return {
							id: attachment.id,
							name: attachment.original_filename || `Dokument_${attachment.id}.pdf`,
							icon: iconOption.icon,
							color: iconOption.color,
							remoteUrl: `${SERVER_URL}/api/attachments/${attachment.id}/file`,
						};
					}),
				);
			} catch (error: any) {
				if (error.name !== 'AbortError') {
					console.error('Available files load error:', error);
					setAvailableFiles([]);
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsAvailableFilesLoading(false);
				}
			}
		};

		fetchAvailableFiles();

		return () => abortController.abort();
	}, []);

	/**
	 * Initial setup for the screen.
	 * Thread creation is deferred until the user sends the first message (lazy initialization).
	 */
	useEffect(() => {
		const abortController = new AbortController();

		if (fetchAbortControllerRef.current) {
			fetchAbortControllerRef.current.abort();
			fetchAbortControllerRef.current = null;
		}
		if (ttsAbortControllerRef.current) {
			ttsAbortControllerRef.current.abort();
			ttsAbortControllerRef.current = null;
		}
		if (sttAbortControllerRef.current) {
			sttAbortControllerRef.current.abort();
			sttAbortControllerRef.current = null;
		}
		if (ttsPlayer && ttsPlayer.playing) {
			ttsPlayer.pause();
		}

		setCurrentThreadId(null);
		setMessages([{ id: 1, sender: 'ai', text: initialMessage }]);
		setInputText('');
		setShowTextInput(false);
		setCurrentImage(null);
		setCurrentImages([]);
		setCurrentImageIndex(0);
		setAttachmentPage(1);
		setAttachmentId(null);
		setAttachmentName('');
		setSelectedPdf(null);
		setShowSchema(true);
		setIsGenerating(false);
		setIsAudioPlaying(false);
		setIsTranscribing(false);
		setIsLoading(Boolean(threadId));

		const loadThreadMessages = async () => {
			if (!threadId) return;

			const parsedThreadId = Number(threadId);
			if (!Number.isFinite(parsedThreadId)) {
				setIsLoading(false);
				return;
			}

			try {
				const authToken = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';
				const response = await fetch(
					`${SERVER_URL}/api/threads/${parsedThreadId}/messages`,
					{
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${authToken}`,
						},
						signal: abortController.signal,
					},
				);

				if (!response.ok) {
					throw new Error(`Failed to load thread messages: ${response.status}`);
				}

				const threadMessages = (await response.json()) as ThreadMessagePayload[];

				setCurrentThreadId(parsedThreadId);
				setMessages(
					threadMessages.map((message) => ({
						id: message.id,
						sender: message.sender === 'user' ? 'user' : 'ai',
						text: message.content,
					})),
				);
			} catch (error: any) {
				if (error.name !== 'AbortError') {
					console.error('Thread messages load error:', error);
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		};

		loadThreadMessages();

		return () => abortController.abort();
	}, [sessionKey, threadId, ttsPlayer]);

	useEffect(() => {
		if (currentImage) setShowSchema(true);
	}, [currentImage]);

	/**
	 * Track audio player state
	 */
	useEffect(() => {
		const interval = setInterval(() => {
			if (ttsPlayer && ttsPlayer.playing) {
				setIsAudioPlaying(true);
			} else {
				setIsAudioPlaying(false);
			}
		}, 300);
		return () => clearInterval(interval);
	}, [ttsPlayer]);

	/**
	 * Stop AI generation and audio playback
	 */
	const handleStop = () => {
		if (fetchAbortControllerRef.current) {
			fetchAbortControllerRef.current.abort();
			fetchAbortControllerRef.current = null;
		}
		if (ttsAbortControllerRef.current) {
			ttsAbortControllerRef.current.abort();
			ttsAbortControllerRef.current = null;
		}
		if (sttAbortControllerRef.current) {
			sttAbortControllerRef.current.abort();
			sttAbortControllerRef.current = null;
		}
		if (ttsPlayer && ttsPlayer.playing) {
			ttsPlayer.pause();
		}
		setIsGenerating(false);
		setIsLoading(false);
		setIsAudioPlaying(false);
		setIsTranscribing(false);
		setMessages((prev) => prev.filter((msg) => msg.sender !== 'ai' || msg.text.length > 0));
		setMessages((prev) => prev.filter((msg) => !msg.isSpeaking));
	};

	/**
	 * Fetch TTS audio from OpenAI and play it
	 * @param {string} text - The text to be converted to speech
	 */
	const playChatGptAudio = async (text: string) => {
		const abortController = new AbortController();
		ttsAbortControllerRef.current = abortController;

		try {
			setIsLoading(true);
			const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

			if (!apiKey) {
				alert('Missing API Key!');
				return;
			}

			const response = await fetch('https://api.openai.com/v1/audio/speech', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey.trim()}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'tts-1',
					input: text,
					voice: 'alloy',
				}),
				signal: abortController.signal,
			});

			if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
			if (abortController.signal.aborted) return;

			if (Platform.OS === 'web') {
				const blob = await response.blob();
				if (abortController.signal.aborted) return;

				const url = URL.createObjectURL(blob);
				ttsPlayer.replace(url);
				setIsAudioPlaying(true);
				ttsPlayer.play();
			} else {
				const arrayBuffer = await response.arrayBuffer();
				if (abortController.signal.aborted) return;

				const base64data = Buffer.from(arrayBuffer).toString('base64');
				const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';

				await FileSystem.writeAsStringAsync(fileUri, base64data, {
					encoding: FileSystem.EncodingType.Base64,
				});

				if (abortController.signal.aborted) return;

				ttsPlayer.replace(fileUri);
				setIsAudioPlaying(true);
				ttsPlayer.play();
			}
		} catch (error: any) {
			if (error.name === 'AbortError') return;
			console.error('ChatGPT TTS error:', error);
		} finally {
			setIsLoading(false);
			setIsGenerating(false);
			if (ttsAbortControllerRef.current === abortController) {
				ttsAbortControllerRef.current = null;
			}
		}
	};

	/**
	 * Main function for handling message exchange with the API.
	 * Creates a new thread if one doesn't exist.
	 * @param {string} question - The user's input query
	 */
	const askAPI = async (question: string) => {
		setIsLoading(true);
		setIsGenerating(true);
		const aiMessageId = Date.now() + Math.random();
		const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';

		// Add an empty AI bubble placeholder to be populated later
		setMessages((prev) => [...prev, { id: aiMessageId, sender: 'ai', text: '' }]);

		const abortController = new AbortController();
		fetchAbortControllerRef.current = abortController;

		try {
			let activeThreadId = currentThreadId;

			// 1. IF THREAD DOES NOT EXIST (first message in session) -> CREATE IT
			if (!activeThreadId) {
				const threadResponse = await fetch(`${SERVER_URL}/api/threads`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${AUTH_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						device_id: HARDCODED_DEVICE_ID,
						title: question.length > 40 ? `${question.substring(0, 40)}...` : question,
					}),
					signal: abortController.signal,
				});

				if (!threadResponse.ok) throw new Error('Failed to create a new thread.');
				const threadData = await threadResponse.json();

				activeThreadId = threadData.id;
				setCurrentThreadId(activeThreadId);
			}

			// 2. SEND MESSAGE TO THE ACTIVE THREAD
			let fullText = '';
			let imageUrl: string | null = null;
			let systemMessageId: number | null = null;

			await new Promise<void>((resolve, reject) => {
				const eventSource = new EventSource<StreamEvent>(
					`${SERVER_URL}/api/threads/${activeThreadId}/messages`,
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
						prev.map((msg) =>
							msg.id === aiMessageId ? { ...msg, text: displayText } : msg,
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
							msg.id === aiMessageId ? { ...msg, text: fullText } : msg,
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
					setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
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
					`${SERVER_URL}/api/messages/${systemMessageId}/chunks`,
					{
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${AUTH_TOKEN}`,
						},
						signal: abortController.signal,
					},
				);

				if (chunksResponse.ok) {
					const chunks = (await chunksResponse.json()) as SourceChunkPayload[];
					const chunkImagePaths = chunks.flatMap((chunk) => chunk.metadata?.images || []);
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
										buildChunkImageUrl(imagePath),
										AUTH_TOKEN,
										abortController.signal,
									).catch((error) => {
										if (abortController.signal.aborted) throw error;
										console.error('Source image load error:', error);
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
							`${SERVER_URL}/api/attachments/${sourceAttachmentId}`,
							{
								headers: {
									Accept: 'application/json',
									Authorization: `Bearer ${AUTH_TOKEN}`,
								},
								signal: abortController.signal,
							},
						);

						if (attachmentResponse.ok) {
							const attachment =
								(await attachmentResponse.json()) as AttachmentPayload;
							sourceAttachmentName =
								attachment.original_filename ||
								`Dokument_${sourceAttachmentId}.pdf`;
						} else {
							sourceAttachmentName = `Dokument_${sourceAttachmentId}.pdf`;
						}

						setAttachmentId(sourceAttachmentId);
						setAttachmentName(sourceAttachmentName);
						setAttachmentPage(sourceAttachmentPage);
					}
				}
			}

			// Handle potential attachments/images
			if (imageUrl) {
				const nextImages = imageUrls.length > 0 ? imageUrls : [imageUrl];

				setSelectedPdf(null);
				setCurrentImages(nextImages);
				setCurrentImageIndex(0);
				setCurrentImage(imageUrl);
				setShowSchema(true);
			} else if (sourceAttachmentId) {
				setCurrentImages([]);
				setCurrentImageIndex(0);
				setCurrentImage(null);
				setShowSchema(false);
				setSelectedPdf({
					name: sourceAttachmentName || `Dokument_${sourceAttachmentId}.pdf`,
					icon: 'file-pdf-box',
					color: '#EF4444',
					source: {
						uri: `${SERVER_URL}/api/attachments/${sourceAttachmentId}/file`,
						headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
					},
					page: sourceAttachmentPage,
				});
			}

			// Play AI response audio
			if (!abortController.signal.aborted && fullText.length > 0) {
				playChatGptAudio(fullText);
			} else {
				setIsGenerating(false);
			}
		} catch (error: any) {
			if (error.name === 'AbortError') {
				console.log('Request aborted by the user.');
				setMessages((prev) =>
					prev.filter((msg) => msg.id !== aiMessageId || msg.text.length > 0),
				);
			} else {
				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === aiMessageId
							? { ...msg, text: `Wystąpił błąd komunikacji: ${error.message}` }
							: msg,
					),
				);
			}
			setIsGenerating(false);
		} finally {
			setIsLoading(false);
			if (fetchAbortControllerRef.current === abortController) {
				fetchAbortControllerRef.current = null;
			}
		}
	};

	/**
	 * Handle manual text submission
	 */
	const handleSendText = () => {
		if (inputText.trim().length === 0) return;

		handleStop();

		const userTempId = Date.now();
		setMessages((prev) => [
			...prev,
			{ id: userTempId, sender: 'user', text: inputText.trim(), isSpeaking: false },
		]);

		askAPI(inputText.trim());

		setInputText('');
		setShowTextInput(false);
	};

	/**
	 * Send recorded audio file to Deepgram for STT translation
	 * @param {string} uri - Local URI of the audio file
	 */
	const sendToDeepgram = async (uri: string) => {
		const abortController = new AbortController();
		sttAbortControllerRef.current = abortController;
		setIsLoading(true);
		setIsTranscribing(true);
		try {
			const responseFile = await fetch(uri, { signal: abortController.signal });
			const audioBlob = await responseFile.blob();

			const response = await fetch(
				'https://api.deepgram.com/v1/listen?model=nova-3&numerals=true&language=pl&smart_format=true',
				{
					method: 'POST',
					headers: {
						Authorization: `Token ${process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY}`,
						'Content-Type': 'audio/m4a',
					},
					body: audioBlob,
					signal: abortController.signal,
				},
			);

			if (!response.ok) throw new Error(`Deepgram Error ${response.status}`);
			if (abortController.signal.aborted) return;

			const data = await response.json();
			if (abortController.signal.aborted) return;
			const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

			if (transcript.trim().length > 0) {
				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === userSpeakingMessageIdRef.current
							? { ...msg, text: transcript, isSpeaking: false }
							: msg,
					),
				);
				askAPI(transcript);
				setIsTranscribing(false);
			} else {
				setMessages((prev) =>
					prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
				setIsTranscribing(false);
			}
		} catch (error: any) {
			if (error.name === 'AbortError') {
				setMessages((prev) =>
					prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
				);
				return;
			}
			console.error('Deepgram Error:', error);
			setMessages((prev) =>
				prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
			);
			setIsLoading(false);
			setIsTranscribing(false);
		} finally {
			if (sttAbortControllerRef.current === abortController) {
				sttAbortControllerRef.current = null;
			}
		}
	};

	/**
	 * Stop the ongoing recording session and push data to Deepgram
	 */
	const stopRecordingAndSend = async () => {
		if (meteringIntervalRef.current) {
			clearInterval(meteringIntervalRef.current);
			meteringIntervalRef.current = null;
		}

		if (isStoppingRecordingRef.current) return;

		if (isStartingRecordingRef.current && !audioRecorder.isRecording) {
			shouldStopAfterStartRef.current = true;
			setIsListening(false);
			return;
		}

		if (!audioRecorder.isRecording) {
			setIsListening(false);
			setIsLoading(false);
			setIsTranscribing(false);
			return;
		}

		isStoppingRecordingRef.current = true;
		setIsTranscribing(true);
		setIsLoading(true);
		setIsListening(false);

		try {
			const recordingStartedAt = recordingStartedAtRef.current;
			if (recordingStartedAt) {
				const remainingRecordingTime =
					MIN_RECORDING_DURATION_MS - (Date.now() - recordingStartedAt);
				if (remainingRecordingTime > 0) {
					await new Promise((resolve) => setTimeout(resolve, remainingRecordingTime));
				}
			}

			await audioRecorder.stop();
			const uri = audioRecorder.uri;
			if (uri) {
				sendToDeepgram(uri);
			} else {
				setMessages((prev) =>
					prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
				setIsTranscribing(false);
			}
		} catch (error) {
			console.error('Error while stopping recording:', error);
			setMessages((prev) =>
				prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
			);
			setIsLoading(false);
			setIsTranscribing(false);
		} finally {
			isStoppingRecordingRef.current = false;
			recordingStartedAtRef.current = null;
		}
	};

	/**
	 * Start tracking microphone metering to detect periods of silence
	 */
	const startMetering = () => {
		lastLoudTime.current = Date.now();
		hasSpoken.current = false;

		meteringIntervalRef.current = setInterval(() => {
			const status = audioRecorder.getStatus();

			if (!status.isRecording) return;

			const metering = status.metering ?? -160;
			const now = Date.now();

			let newScale = 0.2;
			if (metering > -50) {
				newScale = ((metering + 50) / 50) * (1.5 - 0.2) + 0.2;
			}
			newScale = Math.max(0.2, Math.min(1.5, newScale));

			Animated.timing(soundLevelAnim, {
				toValue: newScale,
				duration: 100,
				useNativeDriver: true,
			}).start();

			if (metering > silenceThreshold) {
				lastLoudTime.current = now;
				hasSpoken.current = true;
			} else {
				if (hasSpoken.current) {
					if (now - lastLoudTime.current > silenceDuration) {
						stopRecordingAndSend();
					}
				} else {
					if (now - lastLoudTime.current > initialSilenceDuration) {
						stopRecordingAndSend();
					}
				}
			}
		}, 100);
	};

	const hasPendingVoiceInput = messages.some((m) => m.isSpeaking);
	const isMicProcessing =
		!isListening &&
		(hasPendingVoiceInput || isTranscribing || isLoading || isGenerating || isAudioPlaying);

	const blockMicRestart = useCallback(() => {
		micRestartBlockedUntilRef.current = Date.now() + MIC_RESTART_COOLDOWN_MS;
		setIsMicRestartBlocked(true);

		if (micRestartCooldownTimeoutRef.current) {
			clearTimeout(micRestartCooldownTimeoutRef.current);
		}

		micRestartCooldownTimeoutRef.current = setTimeout(() => {
			micRestartBlockedUntilRef.current = 0;
			micRestartCooldownTimeoutRef.current = null;
			setIsMicRestartBlocked(false);
		}, MIC_RESTART_COOLDOWN_MS);
	}, []);

	useEffect(() => {
		if (!wasMicProcessingRef.current && isMicProcessing) {
			micProcessingStartedAtRef.current = Date.now();
		}

		if (wasMicProcessingRef.current && !isMicProcessing) {
			const processingStartedAt = micProcessingStartedAtRef.current;
			if (
				processingStartedAt &&
				Date.now() - processingStartedAt < SHORT_MIC_PROCESSING_DURATION_MS
			) {
				blockMicRestart();
			}
			micProcessingStartedAtRef.current = null;
		}

		wasMicProcessingRef.current = isMicProcessing;
	}, [blockMicRestart, isMicProcessing]);

	/**
	 * Handle microphone button press
	 */
	const handleMicPress = async () => {
		if (showTextInput) setShowTextInput(false);

		if (isStoppingRecordingRef.current) return;

		if (isListening || isStartingRecordingRef.current || audioRecorder.isRecording) {
			await stopRecordingAndSend();
			return;
		}

		if (isMicRestartBlocked || Date.now() < micRestartBlockedUntilRef.current) return;

		if (isMicProcessing) {
			handleStop();
			const processingStartedAt = micProcessingStartedAtRef.current;
			if (
				processingStartedAt &&
				Date.now() - processingStartedAt < SHORT_MIC_PROCESSING_DURATION_MS
			) {
				blockMicRestart();
			}
			return;
		} else {
			handleStop();
			isStartingRecordingRef.current = true;
			shouldStopAfterStartRef.current = false;
			setIsListening(true);

			const userTempId = Date.now();
			userSpeakingMessageIdRef.current = userTempId;
			soundLevelAnim.setValue(0.2);

			setMessages((prev) => [
				...prev,
				{ id: userTempId, sender: 'user', text: '', isSpeaking: true },
			]);

			try {
				const permission = await AudioModule.requestRecordingPermissionsAsync();
				if (!permission.granted) {
					setIsListening(false);
					setMessages((prev) => prev.filter((msg) => msg.id !== userTempId));
					return;
				}

				if (shouldStopAfterStartRef.current) {
					setMessages((prev) => prev.filter((msg) => msg.id !== userTempId));
					return;
				}

				await audioRecorder.prepareToRecordAsync();
				audioRecorder.record();
				recordingStartedAtRef.current = Date.now();
				isStartingRecordingRef.current = false;

				if (shouldStopAfterStartRef.current) {
					await stopRecordingAndSend();
				} else {
					startMetering();
				}
			} catch (err) {
				console.error('Error starting recording:', err);
				setIsListening(false);
				setMessages((prev) => prev.filter((msg) => msg.id !== userTempId));
			} finally {
				isStartingRecordingRef.current = false;
			}
		}
	};
	handleMicPressRef.current = handleMicPress;

	const handleWakeWordDetected = useCallback(() => {
		void handleMicPressRef.current();
	}, []);
	useWakeWord({
		enabled:
			!isListening &&
			!isLoading &&
			!isTranscribing &&
			!isGenerating &&
			!isAudioPlaying &&
			!isMicRestartBlocked,
		onDetected: handleWakeWordDetected,
	});

	const handleImageIndexChange = (nextIndex: number) => {
		const nextImage = currentImages[nextIndex];
		if (!nextImage) return;

		setCurrentImageIndex(nextIndex);
		setCurrentImage(nextImage);
		setShowSchema(true);
	};

	const isBotTyping = isLoading && !messages.some((m) => m.sender === 'ai' && m.text === '');

	if (isMobile) {
		return (
			<RightPanel
				currentSource={currentSource}
				attachmentId={attachmentId}
				attachmentName={attachmentName}
				attachmentPage={attachmentPage}
				availableFiles={availableFiles}
				isAvailableFilesLoading={isAvailableFilesLoading}
				hasAskedQuestion={messages.length > 1}
				currentImage={currentImage}
				currentImages={currentImages}
				currentImageIndex={currentImageIndex}
				onImageIndexChange={handleImageIndexChange}
				isLoading={isLoading}
				selectedPdf={selectedPdf}
				onSelectPdf={(pdf: any) => {
					setSelectedPdf(pdf);
					setShowSchema(false);
				}}
				showSchema={showSchema}
				setShowSchema={setShowSchema}
				setCurrentImage={setCurrentImage}
				isListening={isListening}
				onMicPress={handleMicPress}
				soundLevelAnim={soundLevelAnim}
				isGenerating={isMicProcessing}
				isMicRestartBlocked={isMicRestartBlocked}
				onStop={handleStop}
				messages={messages}
				isChatLoading={isBotTyping}
				showTextInput={showTextInput}
				setShowTextInput={setShowTextInput}
				inputText={inputText}
				setInputText={setInputText}
				onSendText={handleSendText}
				logoUrl={logoUrl}
			/>
		);
	}

	return (
		<View className='flex-1 flex-row bg-black p-4'>
			<LeftPanel
				messages={messages}
				isListening={isListening}
				onMicPress={handleMicPress}
				soundLevelAnim={soundLevelAnim}
				showTextInput={showTextInput}
				setShowTextInput={setShowTextInput}
				inputText={inputText}
				setInputText={setInputText}
				onSendText={handleSendText}
				currentSource={currentSource}
				isGenerating={isMicProcessing}
				isMicRestartBlocked={isMicRestartBlocked}
				onStop={handleStop}
				logoUrl={logoUrl}
			/>
			<RightPanel
				currentSource={currentSource}
				attachmentId={attachmentId}
				attachmentName={attachmentName}
				attachmentPage={attachmentPage}
				availableFiles={availableFiles}
				isAvailableFilesLoading={isAvailableFilesLoading}
				hasAskedQuestion={messages.length > 1}
				currentImage={currentImage}
				currentImages={currentImages}
				currentImageIndex={currentImageIndex}
				onImageIndexChange={handleImageIndexChange}
				isLoading={isLoading}
				isListening={isListening}
				onMicPress={handleMicPress}
				selectedPdf={selectedPdf}
				showSchema={showSchema}
				setShowSchema={setShowSchema}
				onSelectPdf={(pdf: any) => {
					setSelectedPdf(pdf);
					setShowSchema(false);
				}}
				setCurrentImage={setCurrentImage}
				isGenerating={isMicProcessing}
				isMicRestartBlocked={isMicRestartBlocked}
				onStop={handleStop}
				soundLevelAnim={soundLevelAnim}
			/>
		</View>
	);
}
