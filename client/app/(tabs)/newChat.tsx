import { Buffer } from 'buffer';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Animated,
	Image,
	Keyboard,
	Platform,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EventSource, { EventSourceEvent } from 'react-native-sse';
import { WebView } from 'react-native-webview';

import type { Message } from '@/components/LeftPanel';
import PdfViewer from '@/components/PdfViewer';
import RightPanel, { AvailableFile } from '@/components/RightPanel';
import { useWakeWord } from '@/hooks/use-wake-word';
import * as FileSystem from 'expo-file-system/legacy';

const SERVER_URL = 'https://staging.asystent-serwisanta.pl';

type ChatMessage = Message & {
	schemaImage?: string;
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
};

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

type KeyboardFrame = {
	screenY: number;
	height: number;
};

const HARDCODED_DEVICE_ID = 1;
const MIN_RECORDING_DURATION_MS = 500;
const RECORDING_SEND_RESERVE_MS = 500;
const MIC_RESTART_COOLDOWN_MS = 500;
const SHORT_MIC_PROCESSING_DURATION_MS = 2000;
const PRIMARY_ORANGE = '#FF7A00';
const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';

const FILE_ICON_OPTIONS = [
	{ icon: 'file-pdf-box', color: '#EF4444' },
	{ icon: 'file-document-outline', color: '#06B6D4' },
	{ icon: 'lightning-bolt', color: '#EAB308' },
	{ icon: 'cogs', color: '#A855F7' },
	{ icon: 'wrench-outline', color: '#3B82F6' },
	{ icon: 'shield-check-outline', color: '#22C55E' },
];

const QUICK_PROMPTS = [
	'Nie działa podnoszenie wideł',
	'Pokaż procedurę diagnostyczną',
	'Jak bezpiecznie podnosić?',
	'Gdzie sprawdzić poziom oleju?',
	'Maszyna nie rusza po uruchomieniu',
	'Mam błąd 2:002',
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

const getInvertedImageHtml = (imageUrl: string) => `
	<!DOCTYPE html>
	<html>
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
		<style>
			html, body { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #000000; overflow: hidden; }
			body { display: flex; align-items: center; justify-content: center; }
			img { display: block; width: 100%; height: 100%; object-fit: contain; filter: invert(100%); }
		</style>
	</head>
	<body>
		<img src="${imageUrl}" />
	</body>
	</html>
`;

const ListeningPulse = () => {
	const scale = useRef(new Animated.Value(1)).current;
	const opacity = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.parallel([
				Animated.timing(scale, {
					toValue: 1.5,
					duration: 1000,
					useNativeDriver: true,
				}),
				Animated.timing(opacity, {
					toValue: 0,
					duration: 1000,
					useNativeDriver: true,
				}),
			]),
		);

		animation.start();
		return () => animation.stop();
	}, [opacity, scale]);

	return (
		<Animated.View
			style={{
				position: 'absolute',
				width: '100%',
				height: '100%',
				borderRadius: 12,
				borderWidth: 2,
				borderColor: LISTENING_CYAN,
				transform: [{ scale }],
				opacity,
			}}
		/>
	);
};

const SoundWaveformIndicator = ({ soundLevel }: { soundLevel: Animated.Value }) => {
	const bars = Array.from({ length: 8 }, (_, index) => index);

	return (
		<View className='flex-row items-center justify-center min-h-[20px] gap-[3px]'>
			{bars.map((index) => (
				<Animated.View
					key={index}
					style={{
						width: 3,
						height: 16 - Math.abs(index - 3.5) * 2,
						backgroundColor: '#FFFFFF',
						borderRadius: 1.5,
						transform: [{ scaleY: soundLevel }],
						opacity: soundLevel.interpolate({
							inputRange: [0.2, 1.5],
							outputRange: [0.4, 1],
							extrapolate: 'clamp',
						}),
					}}
				/>
			))}
		</View>
	);
};

const TypingDotsIndicator = ({ color = '#FFFFFF' }: { color?: string }) => {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.timing(progress, {
				toValue: 3,
				duration: 1800,
				useNativeDriver: true,
			}),
		);

		animation.start();
		return () => animation.stop();
	}, [progress]);

	return (
		<View className='flex-row items-center justify-center py-1 gap-1.5'>
			{[0, 1, 2].map((index) => {
				const opacity = progress.interpolate({
					inputRange: [index, index + 0.25, index + 0.75, index + 1, 3],
					outputRange: [0.35, 1, 1, 0.35, 0.35],
					extrapolate: 'clamp',
				});
				const translateY = progress.interpolate({
					inputRange: [index, index + 0.25, index + 0.5, index + 0.75, 3],
					outputRange: [0, -3, -3, 0, 0],
					extrapolate: 'clamp',
				});

				return (
					<Animated.View
						key={index}
						style={{
							width: 6,
							height: 6,
							borderRadius: 3,
							backgroundColor: color,
							opacity,
							transform: [{ translateY }],
						}}
					/>
				);
			})}
		</View>
	);
};

type AssistantResponseBlock =
	| { type: 'text'; content: string }
	| { type: 'checklist'; items: string[] }
	| { type: 'warning'; content: string }
	| { type: 'next'; content: string };

const parseAssistantResponseBlocks = (text: string): AssistantResponseBlock[] => {
	const blocks: AssistantResponseBlock[] = [];
	const normalizedText = text.replace(/\r\n/g, '\n');
	const directivePattern = /::(checklist|warning|next)\b[ \t]*/gi;
	const matches = Array.from(normalizedText.matchAll(directivePattern));

	const pushTypedBlock = (type: AssistantResponseBlock['type'], content: string) => {
		const trimmedContent = content.trim();
		if (!trimmedContent) return;

		if (type === 'checklist') {
			const checklistContent = content.replace(/\s+/g, ' ').trim();
			const itemMarkers = Array.from(checklistContent.matchAll(/[-*]\s+/g));
			const items =
				itemMarkers.length > 0
					? itemMarkers
							.map((match, index) => {
								const itemStart = (match.index ?? 0) + match[0].length;
								const itemEnd =
									index + 1 < itemMarkers.length
										? itemMarkers[index + 1].index ?? checklistContent.length
										: checklistContent.length;

								return checklistContent.slice(itemStart, itemEnd).trim();
							})
							.filter(Boolean)
					: content
							.split('\n')
							.map((line) => line.trim().replace(/^[-*]\s+/, '').trim())
							.filter(Boolean);

			if (items.length > 0) {
				blocks.push({ type: 'checklist', items });
			}
		} else {
			blocks.push({ type, content: trimmedContent });
		}
	};

	if (matches.length === 0) {
		pushTypedBlock('text', normalizedText);
		return blocks.length > 0 ? blocks : [{ type: 'text', content: text }];
	}

	const firstMatch = matches[0];
	const firstIndex = firstMatch.index ?? 0;
	pushTypedBlock('text', normalizedText.slice(0, firstIndex));

	matches.forEach((match, index) => {
		const matchIndex = match.index ?? 0;
		const contentStart = matchIndex + match[0].length;
		const contentEnd =
			index + 1 < matches.length ? matches[index + 1].index ?? normalizedText.length : normalizedText.length;
		const type = match[1].toLowerCase() as AssistantResponseBlock['type'];

		pushTypedBlock(type, normalizedText.slice(contentStart, contentEnd));
	});

	return blocks.length > 0 ? blocks : [{ type: 'text', content: text }];
};

const stripResponseDirectivesForSpeech = (text: string) =>
	text
		.replace(/::(checklist|warning|next)\b[ \t]*/gi, '')
		.replace(/^\s*[-*]\s+/gm, '')
		.trim();

const StructuredAssistantResponse = ({
	text,
	compact = false,
}: {
	text: string;
	compact?: boolean;
}) => {
	const blocks = parseAssistantResponseBlocks(text);
	const paragraphClassName = compact
		? 'text-[#D8DCE2] text-[16px] leading-[23px]'
		: 'text-[#D7D9DE] text-[18px] leading-7';
	const checklistBoxSize = compact ? 23 : 28;
	const checklistTextStyle = {
		color: '#F3F4F6',
		fontSize: compact ? 16 : 18,
		lineHeight: compact ? 22 : 25,
		paddingTop: compact ? 2 : 3,
	};

	return (
		<View style={{ width: '100%' }}>
			{blocks.map((block, index) => {
				if (block.type === 'checklist') {
					return (
						<View
							key={`${block.type}-${index}`}
							style={{ width: '100%', marginTop: 12 }}>
							{block.items.map((item, itemIndex) => (
								<View
									key={`${item}-${itemIndex}`}
									style={{
										width: '100%',
										flexDirection: 'row',
										alignItems: 'flex-start',
										marginBottom: 12,
									}}>
									<View
										style={{
											width: checklistBoxSize,
											height: checklistBoxSize,
											flexShrink: 0,
											marginRight: 12,
											marginTop: 2,
											borderWidth: 1,
											borderColor: PRIMARY_ORANGE,
											borderRadius: 6,
											backgroundColor: 'transparent',
										}}
									/>
									<View style={{ flex: 1, minWidth: 0 }}>
										<Text style={checklistTextStyle}>{item}</Text>
									</View>
								</View>
							))}
						</View>
					);
				}

				if (block.type === 'warning') {
					return (
						<View
							key={`${block.type}-${index}`}
							style={{
								width: '100%',
								flexDirection: 'row',
								alignItems: 'center',
								marginTop: 16,
								paddingHorizontal: 16,
								paddingVertical: 12,
								borderWidth: 1,
								borderColor: '#FF2D55',
								borderRadius: 8,
								backgroundColor: '#2B050B',
							}}>
							<View style={{ flexShrink: 0 }}>
								<Feather name='alert-triangle' size={compact ? 21 : 25} color='#FF304F' />
							</View>
							<Text
								style={{
									flex: 1,
									minWidth: 0,
									marginLeft: 12,
									color: '#F5F5F5',
									fontSize: compact ? 15 : 18,
									lineHeight: compact ? 21 : 25,
								}}>
								{block.content}
							</Text>
						</View>
					);
				}

				if (block.type === 'next') {
					return (
						<View
							key={`${block.type}-${index}`}
							style={{
								width: '100%',
								flexDirection: 'row',
								alignItems: 'flex-start',
								marginTop: 16,
							}}>
							<View style={{ flexShrink: 0, marginTop: compact ? 1 : 2 }}>
								<Feather
									name='arrow-right'
									size={compact ? 22 : 27}
									color='#F4F4F5'
								/>
							</View>
							<Text
								style={{
									flex: 1,
									minWidth: 0,
									marginLeft: 12,
									paddingTop: compact ? 3 : 4,
									color: '#F4F4F5',
									fontSize: compact ? 16 : 18,
									lineHeight: compact ? 23 : 25,
								}}>
								{block.content}
							</Text>
						</View>
					);
				}

				return (
					<Text
						key={`${block.type}-${index}`}
						className={`${paragraphClassName} ${index > 0 ? 'mt-3' : ''}`}>
						{block.content}
					</Text>
				);
			})}
		</View>
	);
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
	const { width, height } = useWindowDimensions();
	const isPortrait = height > width;
	const insets = useSafeAreaInsets();
	const router = useRouter();

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
	const [shouldFocusStartPromptInput, setShouldFocusStartPromptInput] =
		useState<boolean>(false);
	const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrame | null>(null);
	const [currentImage, setCurrentImage] = useState<string | null>(null);
	const [currentImages, setCurrentImages] = useState<string[]>([]);
	const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
	const [currentImageAspectRatio, setCurrentImageAspectRatio] = useState<number>(1);
	const [attachmentPage, setAttachmentPage] = useState<number>(1);

	const [attachmentId, setAttachmentId] = useState<number | null>(null);
	const [attachmentName, setAttachmentName] = useState<string>('');
	const [showDesktopSources, setShowDesktopSources] = useState<boolean>(false);
	const [showFullscreenSchema, setShowFullscreenSchema] = useState<boolean>(false);
	const [showSourcePanel, setShowSourcePanel] = useState<boolean>(false);
	const [sourcePanelPdf, setSourcePanelPdf] = useState<any>(null);
	const [isFileDownloading, setIsFileDownloading] = useState<boolean>(false);
	const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
	const [downloadedFileIds, setDownloadedFileIds] = useState<Set<number>>(new Set());
	const desktopScrollViewRef = useRef<ScrollView>(null);
	const startPromptInputRef = useRef<TextInput>(null);

	// --- CHAT & THREAD STATE ---
	const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
	const [currentSource, setCurrentSource] = useState<string>(deviceName || 'Wybierz maszynę');

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const hasStartedChat = messages.length > 0 || Boolean(threadId);

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
	const ambientNoiseDbRef = useRef<number | null>(null);
	const speechFrameCountRef = useRef<number>(0);
	const meteringStartedAtRef = useRef<number>(0);
	const speechStartedAtRef = useRef<number | null>(null);
	const speechPeakDbRef = useRef<number | null>(null);

	// --- REQUEST CANCELLATION REFERENCES ---
	const fetchAbortControllerRef = useRef<AbortController | null>(null);
	const ttsAbortControllerRef = useRef<AbortController | null>(null);
	const sttAbortControllerRef = useRef<AbortController | null>(null);
	const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);
	const webPdfObjectUrlRef = useRef<string | null>(null);
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
	const silenceDuration = 1300;
	const initialSilenceDuration = 5000;
	const meteringCalibrationDuration = 800;
	const maxRecordingAfterSpeechMs = 9000;
	const speechOverNoiseDb = 8;
	const strongSpeechOverNoiseDb = 14;
	const speechPeakDropDb = 7;
	const minimumSpeechDb = -52;

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
			if (downloadResumableRef.current) downloadResumableRef.current.cancelAsync();
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
		if (!shouldFocusStartPromptInput || hasStartedChat) return;

		const focusInput = () => startPromptInputRef.current?.focus();
		const firstFocusTimeout = setTimeout(focusInput, 0);
		const secondFocusTimeout = setTimeout(focusInput, 80);
		const retryFocusTimeout = setTimeout(focusInput, 180);

		return () => {
			clearTimeout(firstFocusTimeout);
			clearTimeout(secondFocusTimeout);
			clearTimeout(retryFocusTimeout);
		};
	}, [hasStartedChat, shouldFocusStartPromptInput]);

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

		const showSubscription = Keyboard.addListener(showEvent, (event) => {
			setKeyboardFrame({
				screenY: event.endCoordinates.screenY,
				height: event.endCoordinates.height,
			});
		});
		const hideSubscription = Keyboard.addListener(hideEvent, () => {
			setKeyboardFrame(null);
			if (!hasStartedChat) {
				setShowTextInput(false);
			}
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, [hasStartedChat]);

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

	useEffect(
		() => () => {
			if (webPdfObjectUrlRef.current && Platform.OS === 'web') {
				URL.revokeObjectURL(webPdfObjectUrlRef.current);
				webPdfObjectUrlRef.current = null;
			}
		},
		[],
	);

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
		if (downloadResumableRef.current) {
			downloadResumableRef.current.cancelAsync();
			downloadResumableRef.current = null;
		}
		if (ttsPlayer && ttsPlayer.playing) {
			ttsPlayer.pause();
		}

		setCurrentThreadId(null);
		setMessages([]);
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

	useEffect(() => {
		if (!currentImage) {
			setCurrentImageAspectRatio(1);
			return;
		}

		Image.getSize(
			currentImage,
			(imageWidth, imageHeight) => {
				if (imageWidth > 0 && imageHeight > 0) {
					setCurrentImageAspectRatio(imageWidth / imageHeight);
				}
			},
			() => setCurrentImageAspectRatio(1),
		);
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
			if (sourceAttachmentId) {
				setMessages((prev) =>
					prev.map((message) =>
						message.id === aiMessageId
							? {
									...message,
									sourceAttachmentId,
									sourceAttachmentName:
										sourceAttachmentName || `Dokument_${sourceAttachmentId}.pdf`,
									sourceAttachmentPage,
								}
							: message,
					),
				);
			}

			if (imageUrl) {
				const nextImages = imageUrls.length > 0 ? imageUrls : [imageUrl];

				setSelectedPdf(null);
				setCurrentImages(nextImages);
				setCurrentImageIndex(0);
				setCurrentImage(imageUrl);
				setMessages((prev) =>
					prev.map((message) =>
						message.id === aiMessageId ? { ...message, schemaImage: imageUrl! } : message,
					),
				);
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
				playChatGptAudio(stripResponseDirectivesForSpeech(fullText));
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

			await new Promise((resolve) => setTimeout(resolve, RECORDING_SEND_RESERVE_MS));
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
		ambientNoiseDbRef.current = null;
		speechFrameCountRef.current = 0;
		meteringStartedAtRef.current = Date.now();
		speechStartedAtRef.current = null;
		speechPeakDbRef.current = null;

		meteringIntervalRef.current = setInterval(() => {
			const status = audioRecorder.getStatus();

			if (!status.isRecording) return;

			const metering = status.metering ?? -160;
			const now = Date.now();
			const elapsed = now - meteringStartedAtRef.current;
			const previousAmbient = ambientNoiseDbRef.current ?? metering;

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

			if (elapsed < meteringCalibrationDuration) {
				ambientNoiseDbRef.current =
					previousAmbient + (metering - previousAmbient) * 0.35;
				return;
			}

			const ambientNoise = ambientNoiseDbRef.current ?? metering;
			const speechThreshold = Math.max(ambientNoise + speechOverNoiseDb, minimumSpeechDb);
			const isSpeechCandidate = metering >= speechThreshold;
			const speechPeak = speechPeakDbRef.current ?? metering;
			const strongSpeechThreshold = Math.max(
				ambientNoise + strongSpeechOverNoiseDb,
				speechPeak - speechPeakDropDb,
				minimumSpeechDb,
			);
			const isSpeechLike = !hasSpoken.current
				? isSpeechCandidate
				: metering >= strongSpeechThreshold;

			if (isSpeechLike) {
				speechFrameCountRef.current += 1;
				speechPeakDbRef.current =
					speechPeakDbRef.current === null
						? metering
						: Math.max(speechPeakDbRef.current - 0.25, metering);
				ambientNoiseDbRef.current =
					ambientNoise + (metering - ambientNoise) * (hasSpoken.current ? 0.004 : 0.02);
			} else {
				speechFrameCountRef.current = 0;
				const adaptationRate = hasSpoken.current ? 0.10 : 0.12;
				ambientNoiseDbRef.current =
					ambientNoise + (metering - ambientNoise) * adaptationRate;
				if (speechPeakDbRef.current !== null) {
					speechPeakDbRef.current = Math.max(
						ambientNoiseDbRef.current + strongSpeechOverNoiseDb,
						speechPeakDbRef.current - 0.8,
					);
				}
			}

			if (speechFrameCountRef.current >= 2) {
				lastLoudTime.current = now;
				hasSpoken.current = true;
				if (!speechStartedAtRef.current) {
					speechStartedAtRef.current = now;
				}
			} else {
				if (hasSpoken.current) {
					if (
						now - lastLoudTime.current > silenceDuration ||
						(speechStartedAtRef.current &&
							now - speechStartedAtRef.current > maxRecordingAfterSpeechMs)
					) {
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

	const desktopMicState = isMicProcessing ? 'processing' : isListening ? 'listening' : 'idle';
	const desktopMicStyle =
		desktopMicState === 'processing'
			? {
					backgroundColor: 'rgba(46, 16, 101, 0.92)',
					borderColor: 'rgba(139, 92, 246, 0.9)',
					shadowColor: PROCESSING_VIOLET,
					shadowOpacity: 0.42,
					shadowRadius: 24,
					iconColor: '#FFFFFF',
					label: 'PRZETWARZAM...',
					labelColor: '#FFFFFF',
				}
			: desktopMicState === 'listening'
				? {
						backgroundColor: 'rgba(8, 47, 73, 0.92)',
						borderColor: 'rgba(6, 182, 212, 0.9)',
						shadowColor: LISTENING_CYAN,
						shadowOpacity: 0.45,
						shadowRadius: 26,
						iconColor: '#FFFFFF',
						label: 'SŁUCHAM...',
						labelColor: '#FFFFFF',
					}
				: {
						backgroundColor: '#202028',
						borderColor: '#34313A',
						shadowColor: '#000000',
						shadowOpacity: 0,
						shadowRadius: 0,
						iconColor: '#F0F0F0',
						label: 'Naciśnij, aby mówić',
						labelColor: 'rgba(229, 231, 235, 0.58)',
					};

	const handleDesktopMicPress = () => {
		if (isMicRestartBlocked) return;

		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

		if (isMicProcessing) {
			handleStop();
			return;
		}

		void handleMicPress();
	};

	const desktopActionButtonStyle = {
		borderWidth: 1,
		borderColor: '#FF7A00',
		backgroundColor: '#050505',
	};
	const headerBackButtonStyle = {
		height: 48,
		paddingHorizontal: 18,
		borderWidth: 1,
		borderColor: '#2A2A2A',
		borderRadius: 10,
		backgroundColor: '#0D0D0D',
	};
	const headerSecondaryButtonStyle = {
		height: 48,
		paddingHorizontal: 18,
		borderWidth: 1,
		borderColor: '#2A2A2A',
		borderRadius: 10,
		backgroundColor: '#111111',
	};
	const chatHeaderStyle = {
		height: 76,
		paddingHorizontal: 24,
		borderBottomWidth: 1,
		borderBottomColor: '#1F1F1F',
		backgroundColor: '#0D0D0D',
		shadowColor: '#000000',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.4,
		shadowRadius: 24,
		elevation: 12,
		zIndex: 10,
		...(Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px #00000066' } as any) : {}),
	};
	const desktopControlButtonStyle = {
		width: 82,
		height: 82,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: '#2A2D36',
		backgroundColor: '#1B1D25',
	};
	const desktopControlPanelBlurProps =
		Platform.OS === 'android'
			? ({
					intensity: 8,
					blurReductionFactor: 4,
					experimentalBlurMethod: 'dimezisBlurView',
				} as const)
			: { intensity: Platform.OS === 'web' ? 18 : 24 };

	const renderControlPanel = (orientation: 'horizontal' | 'vertical') => {
		const isHorizontal = orientation === 'horizontal';
		const sideButtonSize = isHorizontal ? 60 : 82;
		const centerButtonSize = 96;
		const sideIconSize = isHorizontal ? 28 : 34;
		const centerIconSize = 50;
		const centerColumnWidth = isHorizontal ? 140 : 124;
		const panelWidth = isHorizontal ? 270 : 132;
		const panelHeight = isHorizontal ? 130 : 404;
		const panelRadius = isHorizontal ? 54 : 68;
		const verticalEdgeGap = 36;
		const verticalMicSlotHeight = centerButtonSize + 22;
		const micLabel = isMicProcessing
			? 'Przetwarzam...'
			: isHorizontal
				? isListening
					? 'Słucham...'
					: 'Naciśnij żeby mówić'
				: desktopMicStyle.label;

		const renderSideButton = (type: 'camera' | 'writing') => {
			const isWritingButton = type === 'writing';
			const isWritingActive = isWritingButton && showTextInput;
			const handleWritingPress = () => {
				if (hasStartedChat) {
					setShowTextInput((visible) => !visible);
					return;
				}

				setShowTextInput(true);
				setShouldFocusStartPromptInput(true);
			};

			return (
				<TouchableOpacity
					key={type}
					onPress={
						isWritingButton ? handleWritingPress : undefined
					}
					activeOpacity={1}
					className='rounded-[12px] items-center justify-center'
					style={{
						...desktopControlButtonStyle,
						width: sideButtonSize,
						height: sideButtonSize,
						backgroundColor: isWritingActive
							? '#1C1F28'
							: desktopControlButtonStyle.backgroundColor,
						borderColor: isWritingActive
							? '#3A404C'
							: desktopControlButtonStyle.borderColor,
					}}>
					<Image
						source={
							type === 'camera'
								? require('../../assets/images/camera.png')
								: require('../../assets/images/writing.png')
						}
						style={{
							width: sideIconSize,
							height: sideIconSize,
							tintColor: isWritingActive ? '#FFFFFF' : '#D4D4D8',
						}}
						resizeMode='contain'
					/>
				</TouchableOpacity>
			);
		};

		const micButton = (
			<View
				key='microphone'
				className='items-center flex-col gap-2'
				style={{
					width: centerColumnWidth,
				}}>
				<TouchableOpacity
					onPress={handleDesktopMicPress}
					disabled={isMicRestartBlocked}
					className='items-center justify-center'
					style={{
						width: centerButtonSize,
						height: centerButtonSize,
						borderRadius: 18,
						backgroundColor: desktopMicStyle.backgroundColor,
						borderWidth: 1,
						borderColor: desktopMicStyle.borderColor,
						shadowColor: desktopMicStyle.shadowColor,
						shadowOffset: { width: 0, height: 0 },
						shadowOpacity: desktopMicStyle.shadowOpacity,
						shadowRadius: desktopMicStyle.shadowRadius,
						elevation: desktopMicState === 'idle' ? 5 : 10,
					}}>
					{isListening && !isMicProcessing ? <ListeningPulse /> : null}
					{isMicProcessing ? (
						<MaterialCommunityIcons
							name='stop'
							size={centerIconSize}
							color={desktopMicStyle.iconColor}
						/>
					) : (
						<Image
							source={require('../../assets/images/micro.png')}
							style={{
								width: centerIconSize,
								height: centerIconSize,
								tintColor: desktopMicStyle.iconColor,
							}}
							resizeMode='contain'
						/>
					)}
				</TouchableOpacity>
				<View className='flex-row items-center justify-center mt-1'>
					{isListening && !isMicProcessing ? (
						<View className='w-1.5 h-1.5 rounded-full mr-2 bg-[#06B6D4]' />
					) : null}
					<Text
						className='text-center text-[11px] font-bold'
						style={{
							height: 14,
							color: desktopMicStyle.labelColor,
							fontSize: 11,
							lineHeight: 14,
							letterSpacing: 0.8,
							textShadowColor: 'rgba(0, 0, 0, 0.8)',
							textShadowOffset: { width: 0, height: 1 },
							textShadowRadius: 3,
						}}
						numberOfLines={1}>
						{micLabel}
					</Text>
				</View>
			</View>
		);

		const controls = isHorizontal
			? [renderSideButton('camera'), micButton, renderSideButton('writing')]
			: [renderSideButton('writing'), micButton, renderSideButton('camera')];

		return (
			<View className='relative' style={{ width: panelWidth, height: panelHeight }}>
				<BlurView
					{...desktopControlPanelBlurProps}
					tint='dark'
					pointerEvents='none'
					className='absolute inset-0 overflow-hidden'
					style={{
						borderRadius: panelRadius,
						borderWidth: 1,
						borderColor: '#242833',
						shadowColor: '#000',
						shadowOffset: { width: 0, height: 10 },
						shadowOpacity: 0.22,
						shadowRadius: 22,
						elevation: 6,
						zIndex: 0,
						backgroundColor: 'rgba(20, 22, 30, 0.92)',
						...(Platform.OS === 'web'
							? ({ backdropFilter: 'blur(8px)' } as any)
							: {}),
					}}
				/>
				<View
					className={`${isHorizontal ? 'flex-row' : 'flex-col'} items-center px-3`}
					style={
						isHorizontal
							? {
									width: panelWidth,
									height: panelHeight,
									paddingVertical: 6,
									gap: 0,
									justifyContent: 'space-between',
									zIndex: 1,
								}
							: {
									width: panelWidth,
									height: panelHeight,
									paddingVertical: 34,
								}
					}>
					{isHorizontal ? (
						<>
							<View style={{ position: 'absolute', left: 12, top: 40 }}>
								{controls[0]}
							</View>
							<View style={{ position: 'absolute', left: 72, top: 8 }}>
								{controls[1]}
							</View>
							<View style={{ position: 'absolute', right: 12, top: 40 }}>
								{controls[2]}
							</View>
						</>
					) : (
						<>
							<View style={{ position: 'absolute', top: verticalEdgeGap }}>
								{controls[0]}
							</View>
							<View
								style={{
									position: 'absolute',
									top: (panelHeight - verticalMicSlotHeight) / 2,
								}}>
								{controls[1]}
							</View>
							<View style={{ position: 'absolute', bottom: verticalEdgeGap }}>
								{controls[2]}
							</View>
						</>
					)}
				</View>
			</View>
		);
	};

	const renderInvertedSchemaPreview = (
		imageUrl: string,
		aspectRatio = currentImageAspectRatio,
	) => (
		<View
			style={{
				width: '100%',
				aspectRatio,
				backgroundColor: '#000000',
				overflow: 'hidden',
			}}>
			{Platform.OS === 'web' ? (
				<img
					src={imageUrl}
					style={{
						display: 'block',
						width: '100%',
						height: 'auto',
						filter: 'invert(100%)',
					}}
					alt='Schemat pomocniczy'
				/>
			) : (
				<WebView
					pointerEvents='none'
					source={{ html: getInvertedImageHtml(imageUrl) }}
					style={{ flex: 1, backgroundColor: '#000000' }}
					scrollEnabled={false}
				/>
			)}
		</View>
	);

	const openMessageSource = (message: ChatMessage) => {
		if (!message.sourceAttachmentId) return;

		setSourcePanelPdf({
			name:
				message.sourceAttachmentName || `Dokument_${message.sourceAttachmentId}.pdf`,
			icon: 'file-pdf-box',
			color: '#EF4444',
			source: {
				uri: `${SERVER_URL}/api/attachments/${message.sourceAttachmentId}/file`,
				headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_AUTH_TOKEN || ''}` },
			},
			page: (message.sourceAttachmentPage || 1) + 1,
		});
		setShowSchema(false);
		setShowSourcePanel(true);
	};

	const openFilesPanel = () => {
		setSourcePanelPdf(null);
		setShowSchema(false);
		setShowSourcePanel(true);
	};

	const closeSourcePanel = () => {
		setShowSourcePanel(false);
		setSourcePanelPdf(null);
	};

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

	const performFileDownload = async (
		file: AvailableFile,
		targetPage: number = 1,
	) => {
		if (isFileDownloading) return;

		const authToken = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';
		setIsFileDownloading(true);
		setDownloadingFileId(file.id);

		try {
			if (Platform.OS === 'web') {
				if (webPdfObjectUrlRef.current) {
					URL.revokeObjectURL(webPdfObjectUrlRef.current);
					webPdfObjectUrlRef.current = null;
				}

				const response = await fetch(file.remoteUrl, {
					headers: { Authorization: `Bearer ${authToken}` },
				});

				if (!response.ok) {
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
			setShowSchema(false);
			setShowSourcePanel(true);
		} catch (error) {
			console.error('Download error:', error);
			Alert.alert('Błąd', `Nie udało się pobrać pliku: ${file.name}`);
		} finally {
			setIsFileDownloading(false);
			setDownloadingFileId(null);
			downloadResumableRef.current = null;
		}
	};

	const openFileInSourcePanel = async (file: AvailableFile) => {
		const localFileUri = getLocalFileUri(file);

		if (downloadedFileIds.has(file.id) && localFileUri) {
			setSourcePanelPdf({
				name: file.name,
				icon: 'file-download',
				color: '#22C55E',
				source: { uri: localFileUri },
				page: 1,
			});
			setShowSchema(false);
			setShowSourcePanel(true);
			return;
		}

		await performFileDownload(file, 1);
	};

	const renderSourcePanelContent = () => {
		if (sourcePanelPdf) {
			return (
				<View className='flex-1 bg-black pt-8 pb-6'>
					<View className='px-6'>
						<Text className='text-[#FF7A00] text-[13px] font-bold tracking-widest mb-5 pr-16'>
							ŹRÓDŁO ODPOWIEDZI
						</Text>
					</View>
					<View className='flex-1 overflow-hidden bg-black'>
						<PdfViewer
							source={sourcePanelPdf.source}
							page={sourcePanelPdf.page || 1}
							preserveTop
						/>
					</View>
				</View>
			);
		}

		return (
			<View className='flex-1 px-6 pt-8 pb-6'>
				<Text className='text-[#FF7A00] text-[13px] font-bold tracking-widest mb-5'>
					WSZYSTKIE PLIKI
				</Text>
				{isAvailableFilesLoading ? (
					<View className='flex-1 items-center justify-center'>
						<ActivityIndicator size='large' color={PRIMARY_ORANGE} />
						<Text className='text-[#AEB3BA] text-[13px] tracking-wide'>
							Ładowanie plików...
						</Text>
					</View>
				) : availableFiles.length > 0 ? (
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ paddingBottom: 24 }}>
						<View className='flex-row flex-wrap justify-center gap-4'>
							{availableFiles.map((file) => {
								const isThisFileDownloading =
									isFileDownloading && downloadingFileId === file.id;
								const isDownloaded = downloadedFileIds.has(file.id);

								return (
									<TouchableOpacity
										key={file.id}
										onPress={() => openFileInSourcePanel(file)}
										disabled={isFileDownloading}
										className='w-[30%] aspect-square py-5 px-3 border rounded-2xl items-center justify-center bg-[#141418] border-[#26262C] relative'>
										{isDownloaded ? (
											<TouchableOpacity
												onPress={() => deleteDownloadedFile(file)}
												disabled={isFileDownloading}
												className='absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 border border-white/15 items-center justify-center z-10'>
												<Feather name='x' size={16} color='#C9CDD3' />
											</TouchableOpacity>
										) : null}

										<View className='w-20 h-20 items-center justify-center relative'>
											<MaterialCommunityIcons
												name={file.icon as any}
												size={56}
												color={file.color}
												style={{ opacity: isDownloaded ? 1 : 0.2 }}
											/>
											{isDownloaded ? null : (
												<View className='absolute inset-0 items-center justify-center'>
													{isThisFileDownloading ? (
														<ActivityIndicator size='large' color='#FFFFFF' />
													) : (
														<Feather name='download-cloud' size={28} color='#FFFFFF' />
													)}
												</View>
											)}
										</View>

										<Text
											className='text-[13px] mt-4 leading-4 font-semibold text-center text-[#C9CDD3]'
											numberOfLines={2}>
											{file.name}
										</Text>
									</TouchableOpacity>
								);
							})}
						</View>
					</ScrollView>
				) : (
					<View className='flex-1 items-center justify-center px-4'>
						<Text className='text-[#AEB3BA] text-[13px] text-center'>
							Brak plików do wyświetlenia.
						</Text>
					</View>
				)}
			</View>
		);
	};

	const renderSourcePanel = () => {
		if (!showSourcePanel) return null;

		return (
			<View
				className='absolute inset-0 flex-row'
				style={{ zIndex: 50, elevation: 50 }}>
				<TouchableOpacity
					activeOpacity={1}
					onPress={closeSourcePanel}
					style={{ width: '40%', backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
				/>
				<View
					className='relative bg-[#07080A] border-l border-white/10'
					style={{
						width: '60%',
						shadowColor: '#000000',
						shadowOpacity: 0.35,
						shadowRadius: 24,
						shadowOffset: { width: -10, height: 0 },
					}}>
					{renderSourcePanelContent()}
					<TouchableOpacity
						onPress={closeSourcePanel}
						className='absolute top-4 right-4 w-11 h-11 rounded-full bg-black/85 border border-white/15 items-center justify-center'
						style={{ zIndex: 2, elevation: 2 }}>
						<Feather name='x' size={22} color='#FFFFFF' />
					</TouchableOpacity>
					{sourcePanelPdf ? (
						<View
							className='absolute bottom-4 left-4 h-11 rounded-full bg-black/85 border border-white/15 px-4 justify-center'
							style={{ zIndex: 2, elevation: 2, maxWidth: '72%' }}>
							<Text
								className='text-[#D8DCE2] text-[12px] font-bold tracking-widest uppercase'
								numberOfLines={1}>
								{sourcePanelPdf.name || 'Dokument.pdf'}
							</Text>
						</View>
					) : null}
				</View>
			</View>
		);
	};

	const renderStartPromptView = (compact = false) => {
		const promptMaxWidth = compact ? '100%' : 980;
		const chipWidth = compact ? '100%' : '48%';
		const keyboardOverlap = keyboardFrame
			? Math.max(0, height - keyboardFrame.screenY, keyboardFrame.height)
			: 0;
		const keyboardBottomOffset = keyboardOverlap + (compact ? 18 : 22);

		return (
			<View
				className='flex-1 justify-center'
				style={{
					paddingHorizontal: compact ? 4 : 24,
					paddingBottom: compact ? 154 : 28,
				}}>
				<View
					style={{
						width: '100%',
						maxWidth: promptMaxWidth,
						alignSelf: 'center',
					}}>
					<View style={{ opacity: keyboardFrame ? 0 : 1 }}>
							<Text
								className='text-white font-semibold'
								numberOfLines={1}
								style={{
									fontSize: compact ? 22 : 26,
									lineHeight: compact ? 28 : 33,
									marginBottom: compact ? 6 : 8,
								}}>
								Jak mogę pomóc?
							</Text>
							<Text
								className='font-normal'
								numberOfLines={compact ? 2 : 1}
								adjustsFontSizeToFit={!compact}
								minimumFontScale={0.86}
								style={{
									color: 'rgba(244, 244, 245, 0.84)',
									fontSize: compact ? 14 : 17,
									lineHeight: compact ? 20 : 24,
									marginBottom: compact ? 24 : 34,
							}}>
								Zadaj pytanie o usterkę, diagnostykę lub procedurę naprawy.
							</Text>
					</View>

					<View
						className='flex-row items-center'
						pointerEvents={keyboardFrame ? 'none' : 'auto'}
						style={{
							height: compact ? 56 : 68,
							borderRadius: compact ? 28 : 34,
							backgroundColor: '#242424',
							paddingLeft: compact ? 18 : 32,
							paddingRight: compact ? 7 : 10,
							marginBottom: compact ? 20 : 22,
							opacity: keyboardFrame ? 0 : 1,
						}}>
						<TextInput
							ref={startPromptInputRef}
							className='flex-1 text-white'
							placeholder='Np. nie działa podnoszenie wideł'
							placeholderTextColor='#A1A1AA'
							value={inputText}
							onChangeText={setInputText}
							onSubmitEditing={handleSendText}
							onFocus={() => {
								setShowTextInput(true);
								setShouldFocusStartPromptInput(false);
							}}
							onBlur={() => {
								setShouldFocusStartPromptInput(false);
								if (!hasStartedChat) setShowTextInput(false);
							}}
							style={{
								fontSize: compact ? 16 : 20,
								lineHeight: compact ? 22 : 27,
							}}
						/>
						<TouchableOpacity
							onPress={handleSendText}
							className='items-center justify-center'
							style={{
								width: compact ? 44 : 54,
								height: compact ? 44 : 54,
								borderRadius: compact ? 22 : 27,
								backgroundColor: PRIMARY_ORANGE,
							}}>
							<Feather name='arrow-up-right' size={compact ? 24 : 30} color='#FFFFFF' />
						</TouchableOpacity>
					</View>

					<View
						className='flex-row flex-wrap justify-center'
						pointerEvents={keyboardFrame ? 'none' : 'auto'}
						style={{
							columnGap: compact ? 8 : 12,
							rowGap: compact ? 6 : 9,
							opacity: keyboardFrame ? 0 : 1,
						}}>
						{QUICK_PROMPTS.map((prompt) => (
							<TouchableOpacity
								key={prompt}
								onPress={() => {
									setInputText(prompt);
									setShowTextInput(false);
								}}
								className='items-center justify-center'
								style={{
									width: chipWidth,
									height: compact ? 34 : 36,
									paddingHorizontal: compact ? 12 : 18,
									borderRadius: compact ? 17 : 18,
									borderWidth: 1,
									borderColor: 'rgba(255, 255, 255, 0.09)',
									backgroundColor: 'rgba(5, 5, 5, 0.72)',
								}}>
								<Text
									className='text-center'
									numberOfLines={1}
									adjustsFontSizeToFit
									minimumFontScale={0.82}
									style={{
										color: 'rgba(244, 244, 245, 0.9)',
										fontSize: compact ? 13 : 16,
										lineHeight: compact ? 17 : 21,
									}}>
									{prompt}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
				{keyboardFrame ? (
					<View
						className='absolute left-0 right-0'
						style={{
							bottom: keyboardBottomOffset,
							paddingHorizontal: compact ? 4 : 24,
							zIndex: 20,
						}}>
						<Text
							className='text-white font-semibold'
							numberOfLines={1}
							style={{
								width: '100%',
								maxWidth: promptMaxWidth,
								alignSelf: 'center',
								fontSize: compact ? 22 : 26,
								lineHeight: compact ? 28 : 33,
								marginBottom: compact ? 6 : 8,
							}}>
							Jak mogę pomóc?
						</Text>
						<Text
							className='font-normal'
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.84}
							style={{
								width: '100%',
								maxWidth: promptMaxWidth,
								alignSelf: 'center',
								color: 'rgba(244, 244, 245, 0.84)',
								fontSize: compact ? 14 : 17,
								lineHeight: compact ? 20 : 24,
								marginBottom: compact ? 24 : 34,
							}}>
							Zadaj pytanie o usterkę, diagnostykę lub procedurę naprawy.
						</Text>
						<View
							className='flex-row items-center'
							style={{
								width: '100%',
								maxWidth: promptMaxWidth,
								alignSelf: 'center',
								height: compact ? 56 : 68,
								borderRadius: compact ? 28 : 34,
								backgroundColor: '#242424',
								paddingLeft: compact ? 18 : 32,
								paddingRight: compact ? 7 : 10,
							}}>
							<TextInput
								ref={startPromptInputRef}
								className='flex-1 text-white'
								placeholder='Np. nie działa podnoszenie wideł'
								placeholderTextColor='#A1A1AA'
								value={inputText}
								onChangeText={setInputText}
								onSubmitEditing={handleSendText}
								onFocus={() => {
									setShowTextInput(true);
									setShouldFocusStartPromptInput(false);
								}}
								onBlur={() => {
									setShouldFocusStartPromptInput(false);
									if (!hasStartedChat) setShowTextInput(false);
								}}
								style={{
									fontSize: compact ? 16 : 20,
									lineHeight: compact ? 22 : 27,
								}}
								autoFocus
							/>
							<TouchableOpacity
								onPress={handleSendText}
								className='items-center justify-center'
								style={{
									width: compact ? 44 : 54,
									height: compact ? 44 : 54,
									borderRadius: compact ? 22 : 27,
									backgroundColor: PRIMARY_ORANGE,
								}}>
								<Feather name='arrow-up-right' size={compact ? 24 : 30} color='#FFFFFF' />
							</TouchableOpacity>
						</View>
					</View>
				) : null}
			</View>
		);
	};

	if (showFullscreenSchema && currentImage) {
		return (
			<View className='flex-1 bg-black px-4 pt-4'>
				<View className='h-14 flex-row items-center'>
					<TouchableOpacity
						onPress={() => setShowFullscreenSchema(false)}
						className='h-12 px-5 flex-row items-center justify-center'
						style={desktopActionButtonStyle}>
						<Feather name='arrow-left' size={22} color={PRIMARY_ORANGE} />
						<Text className='text-[#FF7A00] ml-3 text-[13px] font-semibold tracking-wider'>
							WRÓĆ DO CZATU
						</Text>
					</TouchableOpacity>
				</View>
				<ScrollView
					className='flex-1 mt-4'
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}>
					<View className='w-full bg-black'>{renderInvertedSchemaPreview(currentImage)}</View>
				</ScrollView>
			</View>
		);
	}

	if (isPortrait) {
		const portraitPanelHeight = 140;
		const portraitControlsBottom = insets.bottom > 0 ? insets.bottom + 14 : 24;
		const portraitControlsHeight = portraitPanelHeight;
		const keyboardOverlap = keyboardFrame ? Math.max(0, height - keyboardFrame.screenY) : 0;
		const portraitInputBottom =
			keyboardFrame
				? keyboardOverlap + 8
				: portraitControlsBottom + portraitControlsHeight + 12;
		const portraitMessagesBottomPadding = Math.max(
			portraitControlsHeight + 54,
			portraitInputBottom + (showTextInput ? 70 : 0),
		);

		return (
			<View className='flex-1' style={{ backgroundColor: '#080808' }}>
				<View
					className='flex-row items-center'
					style={chatHeaderStyle}>
					<TouchableOpacity
						onPress={() => router.push('/home')}
						className='w-12 h-12 items-center justify-center'
						style={desktopActionButtonStyle}>
						<Feather name='arrow-left' size={23} color={PRIMARY_ORANGE} />
					</TouchableOpacity>

					<View className='flex-1 flex-row items-center justify-center px-3'>
						{logoUrl ? (
							<Image
								source={{ uri: logoUrl }}
								style={{ width: 88, height: 24, marginRight: 10 }}
								resizeMode='contain'
							/>
						) : null}
						<Text
							className='text-white text-[15px] font-bold tracking-wide'
							numberOfLines={1}
							adjustsFontSizeToFit>
							{currentSource}
						</Text>
					</View>

					<TouchableOpacity
						onPress={openFilesPanel}
						className='w-12 h-12 items-center justify-center'
						style={desktopActionButtonStyle}>
						<Feather
							name='link'
							size={22}
							color={PRIMARY_ORANGE}
						/>
					</TouchableOpacity>
				</View>

				{showDesktopSources ? (
					<View
						className='flex-1 mt-4 px-4'
						style={{ paddingBottom: portraitMessagesBottomPadding }}>
						{selectedPdf ? (
							<View className='flex-1 rounded-xl overflow-hidden bg-[#111318]'>
								<PdfViewer
									source={selectedPdf.source}
									page={selectedPdf.page || 1}
								/>
								<TouchableOpacity
									onPress={() => setSelectedPdf(null)}
									className='absolute top-3 right-3 w-10 h-10 rounded-full bg-black/80 items-center justify-center'>
									<Feather name='x' size={20} color='#FFFFFF' />
								</TouchableOpacity>
							</View>
						) : (
							<ScrollView
								showsVerticalScrollIndicator={false}
								contentContainerStyle={{ paddingBottom: 20 }}>
								{currentImage ? (
									<View className='rounded-xl overflow-hidden border border-[#292D33] bg-[#111318] mb-4'>
										<Text className='text-[#AEB3BA] text-[12px] px-3 py-2'>
											Schemat pomocniczy
										</Text>
										<Image
											source={{ uri: currentImage }}
											style={{ width: '100%', height: 300, backgroundColor: '#000' }}
											resizeMode='contain'
										/>
									</View>
								) : null}

								<Text className='text-[#FF7A00] text-[12px] font-bold tracking-widest mb-3'>
									WSZYSTKIE PLIKI
								</Text>
										{availableFiles.map((file) => (
											<TouchableOpacity
												key={file.id}
												onPress={() => openFileInSourcePanel(file)}
												className='flex-row items-center rounded-xl border border-white/10 bg-[#18181C] px-4 py-4 mb-3'>
												<MaterialCommunityIcons
													name={file.icon as any}
											size={24}
											color={file.color}
										/>
										<Text className='text-[#D8DCE2] text-[14px] ml-3 flex-1'>
											{file.name}
										</Text>
									</TouchableOpacity>
								))}
							</ScrollView>
						)}
					</View>
				) : hasStartedChat ? (
					<ScrollView
						ref={desktopScrollViewRef}
						onContentSizeChange={() =>
							desktopScrollViewRef.current?.scrollToEnd({ animated: true })
						}
						className='flex-1 mt-5 px-4'
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{ paddingBottom: portraitMessagesBottomPadding }}>
						{messages.map((message) =>
							message.sender === 'user' ? (
								<View
									key={message.id}
									className='self-end bg-[#B85000] rounded-[18px] px-4 py-3 mb-5'
									style={{ maxWidth: '88%' }}>
									{message.isSpeaking ? (
										isListening ? (
											<SoundWaveformIndicator soundLevel={soundLevelAnim} />
										) : (
											<TypingDotsIndicator />
										)
									) : (
										<Text className='text-white text-[17px] leading-[22px]'>
											{message.text}
										</Text>
									)}
								</View>
							) : (
								<View key={message.id} className='self-start mb-5' style={{ maxWidth: '96%' }}>
									{message.text ? (
										<StructuredAssistantResponse text={message.text} compact />
									) : (
										<TypingDotsIndicator color={PRIMARY_ORANGE} />
									)}
									{message.schemaImage ? (
										<TouchableOpacity
											onPress={() => {
												setCurrentImage(message.schemaImage || null);
												setShowFullscreenSchema(true);
											}}
											className='rounded-xl overflow-hidden border border-[#292D33] bg-[#111318] mt-4'
											style={{ maxWidth: 610 }}>
											<Text className='text-[#AEB3BA] text-[14px] px-3 py-2 bg-[#111318]'>
												Schemat pomocniczy
											</Text>
											{renderInvertedSchemaPreview(message.schemaImage)}
											<Text className='text-[#AEB3BA] text-[14px] px-3 py-2.5 bg-[#111318]'>
												Naciśnij, aby powiększyć
											</Text>
										</TouchableOpacity>
									) : null}
									{message.sourceAttachmentId ? (
										<TouchableOpacity
											onPress={() => openMessageSource(message)}
											className='self-start flex-row items-center mt-4'>
											<Feather name='arrow-up-right' size={21} color={PRIMARY_ORANGE} />
											<Text className='text-[#FF7A00] text-[12px] ml-2 tracking-wide'>
												POKAŻ ŹRÓDŁO ODPOWIEDZI
											</Text>
										</TouchableOpacity>
									) : null}
								</View>
							),
						)}
					</ScrollView>
				) : (
					renderStartPromptView(true)
				)}

				{showTextInput && hasStartedChat ? (
					<View
					className='absolute left-4 right-4 flex-row items-center'
						style={{ bottom: portraitInputBottom }}>
						<TextInput
							className='flex-1 h-12 border border-[#FF7A00] bg-[#111] text-white px-4 rounded-l-xl'
							placeholder='Wpisz swoje pytanie...'
							placeholderTextColor='#777'
							value={inputText}
							onChangeText={setInputText}
							onSubmitEditing={handleSendText}
							autoFocus
						/>
						<TouchableOpacity
							onPress={handleSendText}
							className='w-12 h-12 bg-[#B85000] rounded-r-xl items-center justify-center'>
							<Feather name='send' size={20} color='#FFFFFF' />
						</TouchableOpacity>
					</View>
				) : null}

				<View
					className='absolute left-0 right-0 items-center'
					style={{ bottom: portraitControlsBottom }}>
					{renderControlPanel('horizontal')}
				</View>
				{renderSourcePanel()}
			</View>
		);
	}

	const keyboardOverlap = keyboardFrame ? Math.max(0, height - keyboardFrame.screenY) : 0;

	return (
		<View className='flex-1' style={{ backgroundColor: '#080808' }}>
			<View
				className='flex-row items-center'
				style={chatHeaderStyle}>
				<TouchableOpacity
					onPress={() => router.push('/home')}
					className='h-12 px-5 flex-row items-center justify-center mr-8'
					style={headerBackButtonStyle}>
					<Feather name='arrow-left' size={22} color='#FF7A00' />
					<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
						WSTECZ
					</Text>
				</TouchableOpacity>

				{logoUrl ? (
					<Image
						source={{ uri: logoUrl }}
						style={{ width: 116, height: 28 }}
						resizeMode='contain'
					/>
				) : null}
				<Text className='text-white text-[24px] font-bold ml-5 tracking-wider'>
					{currentSource}
				</Text>

				<View className='flex-1' />

				<TouchableOpacity
					onPress={() => setShowDesktopSources(false)}
					className='h-12 px-5 flex-row items-center justify-center mr-7'
					style={headerSecondaryButtonStyle}>
					<Image
						source={require('../../assets/images/info.png')}
						style={{ width: 21, height: 21, tintColor: PRIMARY_ORANGE }}
						resizeMode='contain'
					/>
					<Text className='text-[#E6E6E6] ml-4 text-[13px] font-semibold tracking-wider'>
						O MASZYNIE
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={openFilesPanel}
					className='h-12 px-5 flex-row items-center justify-center'
					style={headerSecondaryButtonStyle}>
					<Feather name='link' size={21} color='#FF7A00' />
					<Text className='text-[#E6E6E6] ml-4 text-[13px] font-semibold tracking-wider'>
						WSZYSTKIE PLIKI
					</Text>
				</TouchableOpacity>
			</View>

			<View className='flex-1 flex-row px-6 py-5'>
				{showDesktopSources ? (
					<RightPanel
						currentSource={currentSource}
						attachmentId={attachmentId}
						attachmentName={attachmentName}
						attachmentPage={attachmentPage}
						availableFiles={availableFiles}
						isAvailableFilesLoading={isAvailableFilesLoading}
						hasAskedQuestion={messages.length > 0}
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
							setSourcePanelPdf(pdf);
							setShowSchema(false);
							setShowSourcePanel(true);
						}}
						setCurrentImage={setCurrentImage}
						isGenerating={isMicProcessing}
						isMicRestartBlocked={isMicRestartBlocked}
						onStop={handleStop}
						soundLevelAnim={soundLevelAnim}
					/>
				) : hasStartedChat ? (
					<ScrollView
						ref={desktopScrollViewRef}
						onContentSizeChange={() =>
							desktopScrollViewRef.current?.scrollToEnd({ animated: true })
						}
						className='flex-1 pr-8'
						contentContainerStyle={{ paddingBottom: 30 }}>
						{messages.map((message) =>
							message.sender === 'user' ? (
								<View
									key={message.id}
									className='self-end bg-[#B85000] rounded-full px-7 py-2.5 mb-8'
									style={{ maxWidth: '65%' }}>
									{message.isSpeaking ? (
										isListening ? (
											<SoundWaveformIndicator soundLevel={soundLevelAnim} />
										) : (
											<TypingDotsIndicator />
										)
									) : (
										<Text className='text-white text-[18px]'>{message.text}</Text>
									)}
								</View>
							) : (
								<View key={message.id} className='self-start mb-7' style={{ maxWidth: '78%' }}>
									{message.text ? (
										<StructuredAssistantResponse text={message.text} />
									) : (
										<TypingDotsIndicator color={PRIMARY_ORANGE} />
									)}
									{message.schemaImage ? (
										<TouchableOpacity
											onPress={() => {
												setCurrentImage(message.schemaImage || null);
												setShowFullscreenSchema(true);
											}}
											className='w-[410px] rounded-xl overflow-hidden border border-[#292D33] bg-[#111318] mt-4'>
											<Text className='text-[#AEB3BA] text-[14px] px-3 py-2 bg-[#111318]'>
												Schemat pomocniczy
											</Text>
											{renderInvertedSchemaPreview(message.schemaImage)}
											<Text className='text-[#AEB3BA] text-[14px] px-3 py-2.5 bg-[#111318]'>
												Naciśnij, aby powiększyć
											</Text>
										</TouchableOpacity>
									) : null}
									{message.sourceAttachmentId ? (
										<TouchableOpacity
											onPress={() => openMessageSource(message)}
											className='self-start flex-row items-center mt-4'>
											<Feather name='arrow-up-right' size={23} color={PRIMARY_ORANGE} />
											<Text className='text-[#FF7A00] text-[13px] ml-2 tracking-wide'>
												POKAŻ ŹRÓDŁO ODPOWIEDZI
											</Text>
										</TouchableOpacity>
									) : null}
								</View>
							),
						)}
					</ScrollView>
				) : (
					renderStartPromptView(false)
				)}

				<View className='relative self-center ml-5'>
					{renderControlPanel('vertical')}
				</View>
			</View>

			{showTextInput && hasStartedChat ? (
				<View
					className='absolute left-6 right-[245px] flex-row items-center'
					style={{ bottom: keyboardFrame ? keyboardOverlap + 8 : 24 }}>
					<TextInput
						className='flex-1 h-12 border border-[#FF7A00] bg-[#111] text-white px-4'
						placeholder='Wpisz swoje pytanie...'
						placeholderTextColor='#777'
						value={inputText}
						onChangeText={setInputText}
						onSubmitEditing={handleSendText}
						autoFocus
					/>
					<TouchableOpacity
						onPress={handleSendText}
						className='w-12 h-12 bg-[#B85000] items-center justify-center'>
						<Feather name='send' size={20} color='#FFFFFF' />
					</TouchableOpacity>
				</View>
			) : null}
			{renderSourcePanel()}
		</View>
	);
}
