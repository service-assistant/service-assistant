import { Buffer } from 'buffer';
import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, useWindowDimensions, View } from 'react-native';
import EventSource, { EventSourceEvent } from 'react-native-sse';

import LeftPanel, { Message } from '@/components/LeftPanel';
import RightPanel from '@/components/RightPanel';
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
		image_url?: string;
		page?: number;
		schema_url?: string;
	} | null;
};

type AttachmentPayload = {
	original_filename?: string;
};

const parseStreamData = <T,>(data: string | null): T | string => {
	if (!data) return '';

	try {
		return JSON.parse(data) as T;
	} catch {
		return data;
	}
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
	const { deviceId, deviceName, logoUrl } = useLocalSearchParams<{
		deviceId: string;
		deviceName: string;
		logoUrl: string;
	}>();

	// --- UI & DATA STATES ---
	const [showSchema, setShowSchema] = useState<boolean>(true);
	const [selectedPdf, setSelectedPdf] = useState<any>(null);
	const [isListening, setIsListening] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	// --- STOP CONTROL STATES ---
	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

	const [showTextInput, setShowTextInput] = useState<boolean>(false);
	const [inputText, setInputText] = useState<string>('');
	const [currentImage, setCurrentImage] = useState<string | null>(null);
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
		};
	}, []);

	useEffect(() => {
		if (deviceName) {
			setCurrentSource(deviceName);
		}
	}, [deviceName]);

	/**
	 * Initial setup for the screen.
	 * Thread creation is deferred until the user sends the first message (lazy initialization).
	 */
	useEffect(() => {
		setIsLoading(false);
	}, [deviceId]);

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
		if (ttsPlayer && ttsPlayer.playing) {
			ttsPlayer.pause();
		}
		setIsGenerating(false);
		setIsLoading(false);
		setIsAudioPlaying(false);
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
						device_id: deviceId ? parseInt(deviceId as string, 10) : 1, // Fallback to 1 on failure
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
					const chunk = parseStreamData<string>(event.data);
					const chunkText = typeof chunk === 'string' ? chunk : '';

					if (!chunkText || abortController.signal.aborted) return;

					fullText += chunkText;
					setIsLoading(false);
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === aiMessageId ? { ...msg, text: fullText } : msg,
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

			let sourceAttachmentId: number | null = null;
			let sourceAttachmentName = '';
			let sourceAttachmentPage = 1;

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
					const sourceChunk = chunks[0];

					if (sourceChunk?.attachment_id) {
						sourceAttachmentId = sourceChunk.attachment_id;
						sourceAttachmentPage = sourceChunk.metadata?.page || 1;
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
				setSelectedPdf(null);
				setCurrentImage(imageUrl);
				setShowSchema(true);
			} else if (sourceAttachmentId) {
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
			if (fullText.length > 0) {
				playChatGptAudio(fullText);
			} else {
				setIsGenerating(false);
			}
		} catch (error: any) {
			if (error.name === 'AbortError') {
				console.log('Request aborted by the user.');
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
		setIsLoading(true);
		try {
			const responseFile = await fetch(uri);
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
				},
			);

			if (!response.ok) throw new Error(`Deepgram Error ${response.status}`);

			const data = await response.json();
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
			} else {
				setMessages((prev) =>
					prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
			}
		} catch (error) {
			console.error('Deepgram Error:', error);
			setMessages((prev) =>
				prev.filter((msg) => msg.id !== userSpeakingMessageIdRef.current),
			);
			setIsLoading(false);
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

		setIsListening(false);

		if (audioRecorder.isRecording) {
			try {
				await audioRecorder.stop();
				const uri = audioRecorder.uri;
				if (uri) sendToDeepgram(uri);
			} catch (error) {
				console.error('Error while stopping recording:', error);
			}
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

	/**
	 * Handle microphone button press
	 */
	const handleMicPress = async () => {
		handleStop();

		if (showTextInput) setShowTextInput(false);

		if (isListening) {
			await stopRecordingAndSend();
		} else {
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

				await audioRecorder.prepareToRecordAsync();
				audioRecorder.record();
				startMetering();
			} catch (err) {
				console.error('Error starting recording:', err);
				setIsListening(false);
				setMessages((prev) => prev.filter((msg) => msg.id !== userTempId));
			}
		}
	};

	const isBotTyping = isLoading && !messages.some((m) => m.sender === 'ai' && m.text === '');
	const isBotActive = isGenerating || isAudioPlaying;

	if (isMobile) {
		return (
			<RightPanel
				currentSource={currentSource}
				attachmentId={attachmentId}
				attachmentName={attachmentName}
				attachmentPage={attachmentPage}
				hasAskedQuestion={messages.length > 1}
				currentImage={currentImage}
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
				isGenerating={isBotActive}
				onStop={handleStop}
			/>
		);
	}

	return (
		<View className='flex-1 flex-row bg-black p-4'>
			<LeftPanel
				messages={messages}
				isLoading={isBotTyping}
				isListening={isListening}
				onMicPress={handleMicPress}
				soundLevelAnim={soundLevelAnim}
				showTextInput={showTextInput}
				setShowTextInput={setShowTextInput}
				inputText={inputText}
				setInputText={setInputText}
				onSendText={handleSendText}
				currentSource={currentSource}
				isGenerating={isBotActive}
				onStop={handleStop}
				logoUrl={logoUrl}
			/>
			<RightPanel
				currentSource={currentSource}
				attachmentId={attachmentId}
				attachmentName={attachmentName}
				attachmentPage={attachmentPage}
				hasAskedQuestion={messages.length > 1}
				currentImage={currentImage}
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
				isGenerating={isBotActive}
				onStop={handleStop}
				soundLevelAnim={soundLevelAnim}
			/>
		</View>
	);
}
