import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, {
	type Dispatch,
	forwardRef,
	type SetStateAction,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from 'react';
import {
	AppState,
	BackHandler,
	Keyboard,
	Platform,
	ScrollView,
	StyleSheet,
	TextInput,
	useWindowDimensions,
	View,
} from 'react-native';
import { type EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
	DesktopChatLayout,
	FullscreenSchemaView,
	PortraitChatLayout,
} from '@/components/chat/ChatLayouts';
import type { ChatMessageSourceReference, SchemaImageSource } from '@/components/chat/ChatMessages';
import type { KeyboardFrame } from '@/components/chat/StartPromptView';
import ServiceErrorModal from '@/components/feedback/ServiceErrorModal';
import NameplateScannerModal from '@/components/vehicles/NameplateScannerModal';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAssistantAudio } from '@/hooks/use-assistant-audio';
import { useChatApi } from '@/hooks/use-chat-api';
import { useMicrophone } from '@/hooks/use-microphone';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useSourcePanelFiles } from '@/hooks/use-source-panel-files';
import { useWakeWord } from '@/hooks/use-wake-word';
import { type AvailableFile, MAX_CHAT_PHOTOS, type Message } from '@/types/chat';
import type { ChatThreadWithNameplate, NameplateData } from '@/types/nameplate';
import { API_URL, API_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';
import { fetchWithRetry, HttpError, isTransientNetworkError } from '@/utils/network';

const CHAT_AUTH_TOKEN_OVERRIDE: string | null = null;

type ChatMessage = Message & {
	schemaImage?: SchemaImageSource;
	schemaImages?: SchemaImageSource[];
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
	sourceReferences?: ChatMessageSourceReference[];
	retryQuestion?: string;
	retryPhotoUris?: string[];
};

type DeviceAttachmentPayload = {
	id: number;
	original_filename: string;
};

type ThreadMessagePayload = {
	id: number;
	content: string;
	sender: 'user' | 'assistant';
	has_continuation: boolean;
};

const FILE_ICON_OPTIONS = [
	{ icon: 'file-pdf-box', color: '#EF4444' },
	{ icon: 'file-document-outline', color: '#06B6D4' },
	{ icon: 'lightning-bolt', color: '#EAB308' },
	{ icon: 'cogs', color: '#A855F7' },
	{ icon: 'wrench-outline', color: '#3B82F6' },
	{ icon: 'shield-check-outline', color: '#22C55E' },
];

const WEB_SIDE_PREVIEW_MIN_WIDTH = 1100;

type FullscreenSchemaOverlayHandle = {
	prepare: (imageSource: SchemaImageSource | null) => void;
	open: (imageSource: SchemaImageSource, title?: string) => void;
};

const FullscreenSchemaOverlay = forwardRef<
	FullscreenSchemaOverlayHandle,
	{
		lightMode: boolean;
		insets: EdgeInsets;
		isTablet: boolean;
	}
>(({ lightMode, insets, isTablet }, ref) => {
	const [imageUrl, setImageUrl] = useState<SchemaImageSource | null>(null);
	const [title, setTitle] = useState('SCHEMAT POMOCNICZY');
	const [visible, setVisible] = useState(false);

	useImperativeHandle(
		ref,
		() => ({
			prepare: (nextImageUrl) => {
				setImageUrl(nextImageUrl);
				setTitle('SCHEMAT POMOCNICZY');
				if (!nextImageUrl) setVisible(false);
			},
			open: (nextImageUrl, nextTitle) => {
				setImageUrl(nextImageUrl);
				setTitle(nextTitle ?? 'SCHEMAT POMOCNICZY');
				setVisible(true);
			},
		}),
		[],
	);

	useEffect(() => {
		if (!visible) return;

		const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
			setVisible(false);
			return true;
		});

		return () => subscription.remove();
	}, [visible]);

	if (!imageUrl) return null;

	return (
		<View
			accessibilityElementsHidden={!visible}
			importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
			style={[
				StyleSheet.absoluteFill,
				{
					elevation: visible ? 1000 : 0,
					opacity: visible ? 1 : 0,
					pointerEvents: visible ? 'auto' : 'none',
					zIndex: visible ? 1000 : -1,
				},
			]}>
			<FullscreenSchemaView
				lightMode={lightMode}
				imageUrl={imageUrl}
				title={title}
				aspectRatio={1}
				insets={insets}
				isTablet={isTablet}
				onBack={() => setVisible(false)}
			/>
		</View>
	);
});

FullscreenSchemaOverlay.displayName = 'FullscreenSchemaOverlay';

/**
 * ChatScreen Component
 *
 * Handles the main conversational interface, supporting both text and voice interactions.
 * Features include:
 * - Real-time voice recording with volume metering
 * - Server-side Speech-to-Text (STT)
 * - Server-side Text-to-Speech (TTS)
 * - Managing thread-based conversation history with the backend API
 * - Displaying attachments and schema images
 */
export default function ChatScreen() {
	const { width, height } = useWindowDimensions();
	const isPortrait = height > width;
	const isTablet = Math.min(width, height) >= 600;
	const isWeb = Platform.OS === 'web';
	const useDesktopSidePreview = isWeb && !isPortrait && width >= WEB_SIDE_PREVIEW_MIN_WIDTH;
	const sourcePanelFullScreen = isPortrait || (isWeb && !useDesktopSidePreview);
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const {
		lightThemeEnabled,
		wakeWordEnabled,
		ttsEnabled,
		ttsVoice,
		ttsStyle,
		diagnosticModeEnabled,
	} = useAppSettings();

	const { deviceId, deviceName, logoUrl, chatSession, threadId } = useLocalSearchParams<{
		deviceId: string;
		deviceName: string;
		logoUrl: string;
		chatSession: string;
		threadId?: string;
	}>();
	const parsedDeviceId = Number(deviceId);
	const selectedDeviceId =
		Number.isFinite(parsedDeviceId) && parsedDeviceId > 0 ? parsedDeviceId : null;
	const sessionKey = `${deviceId ?? ''}:${chatSession ?? ''}:${threadId ?? ''}`;
	const currentSource = deviceName || 'Wybierz maszynę';

	const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(threadId));
	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
	const [isAvailableFilesLoading, setIsAvailableFilesLoading] = useState<boolean>(true);
	const [showTextInput, setShowTextInputState] = useState<boolean>(false);
	const [inputText, setInputText] = useState<string>('');
	const [shouldFocusStartPromptInput, setShouldFocusStartPromptInput] = useState<boolean>(false);
	const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrame | null>(null);
	const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [serviceErrorFeature, setServiceErrorFeature] = useState<string | null>(null);
	const [isSpeechInputUnavailable, setIsSpeechInputUnavailable] = useState<boolean>(false);
	const [isVoiceOutputUnavailable, setIsVoiceOutputUnavailable] = useState<boolean>(false);
	const [isChatFocused, setIsChatFocused] = useState<boolean>(false);
	const [nameplateData, setNameplateData] = useState<NameplateData | null>(null);
	const [isMachineInfoVisible, setIsMachineInfoVisible] = useState(false);
	const [isPhotoCaptureVisible, setIsPhotoCaptureVisible] = useState(false);
	const [pendingPhotoUris, setPendingPhotoUris] = useState<string[]>([]);
	const [isMicrophoneActivated, setIsMicrophoneActivated] = useState(false);
	const [desktopSchemaPreview, setDesktopSchemaPreview] = useState<{
		imageUrl: SchemaImageSource;
		title?: string;
	} | null>(null);
	const { reconnectCount } = useNetworkStatus();

	const hasStartedChat = messages.length > 0;
	const messagesScrollViewRef = useRef<ScrollView>(null);
	const startPromptInputRef = useRef<TextInput>(null);
	const isAppActiveRef = useRef(AppState.currentState === 'active');
	const keyboardInteractionAllowedRef = useRef(false);
	const retryInProgressRef = useRef(false);
	const askAPIRef = useRef<(question: string, photoUris?: string[]) => void>(() => undefined);
	const schemaViewerRef = useRef<FullscreenSchemaOverlayHandle>(null);
	const currentImageRef = useRef<SchemaImageSource | null>(null);
	const setShowTextInput = useCallback<Dispatch<SetStateAction<boolean>>>((nextValue) => {
		if (typeof nextValue !== 'function') {
			keyboardInteractionAllowedRef.current = nextValue;
		}
		setShowTextInputState((currentValue) => {
			const nextVisibility =
				typeof nextValue === 'function' ? nextValue(currentValue) : nextValue;
			if (typeof nextValue === 'function') {
				keyboardInteractionAllowedRef.current = nextVisibility;
			}
			return nextVisibility;
		});
	}, []);
	const resetKeyboardUi = useCallback(() => {
		keyboardInteractionAllowedRef.current = false;
		startPromptInputRef.current?.blur();
		Keyboard.dismiss();
		setKeyboardFrame(null);
		setShouldFocusStartPromptInput(false);
		setShowTextInputState(false);
	}, []);
	const setCurrentImage = useCallback<Dispatch<SetStateAction<SchemaImageSource | null>>>(
		(nextValue) => {
			const nextImageUrl =
				typeof nextValue === 'function' ? nextValue(currentImageRef.current) : nextValue;
			currentImageRef.current = nextImageUrl;
			schemaViewerRef.current?.prepare(nextImageUrl);
		},
		[],
	);
	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		if (isTransientNetworkError(error)) return;
		setServiceErrorFeature(featureName);
	}, []);
	const handleSpeechInputError = useCallback((error: unknown) => {
		console.log('Handled speech input error:', error);
		if (isTransientNetworkError(error)) return;
		setIsSpeechInputUnavailable(true);
	}, []);
	const latestUserMessageId = [...messages]
		.reverse()
		.find((message) => message.sender === 'user')?.id;
	const messageScrollTopPadding = isPortrait ? 16 : 20;
	const handleUserMessageLayout = useCallback(
		(message: ChatMessage, y: number) => {
			if (message.id !== latestUserMessageId) return;
			messagesScrollViewRef.current?.scrollTo({
				y: Math.max(0, y - messageScrollTopPadding),
				animated: true,
			});
		},
		[latestUserMessageId, messageScrollTopPadding],
	);

	const { isAudioPlaying, playAssistantAudio, stopAssistantAudio } = useAssistantAudio({
		setIsLoading,
		setIsGenerating,
		ttsVoice,
		ttsStyle,
		onServiceError: (featureName, error) => {
			if (!isTransientNetworkError(error)) setIsVoiceOutputUnavailable(true);
			showServiceError(featureName, error);
		},
	});
	const playAssistantAudioWhenEnabled = useCallback(
		(text: string) => {
			if (!ttsEnabled) {
				setIsGenerating(false);
				return;
			}

			return playAssistantAudio(text);
		},
		[playAssistantAudio, ttsEnabled],
	);

	useEffect(() => {
		if (!ttsEnabled) {
			stopAssistantAudio();
		}
	}, [stopAssistantAudio, ttsEnabled]);
	const { cancelDownload, openFilesPanel, openMessageSource, sourcePanelProps } =
		useSourcePanelFiles({
			availableFiles,
			isAvailableFilesLoading,
			serverUrl: API_URL,
			onServiceError: showServiceError,
			authTokenOverride: CHAT_AUTH_TOKEN_OVERRIDE,
		});
	const openMachineInfoPanel = useCallback(() => {
		sourcePanelProps.onClose();
		setDesktopSchemaPreview(null);
		setIsMachineInfoVisible(true);
	}, [sourcePanelProps]);
	const openFilesPanelWithoutMachineInfo = useCallback(() => {
		setIsMachineInfoVisible(false);
		setDesktopSchemaPreview(null);
		openFilesPanel();
	}, [openFilesPanel]);

	const { askAPI, ensureThread, stopChatApi } = useChatApi<ChatMessage>({
		serverUrl: API_URL,
		deviceId: selectedDeviceId,
		currentThreadId,
		setCurrentThreadId,
		setMessages,
		setIsLoading,
		setIsGenerating,
		setCurrentImage,
		diagnosticModeEnabled,
		playAssistantAudio: playAssistantAudioWhenEnabled,
		ttsEnabled,
		onServiceError: showServiceError,
		authTokenOverride: CHAT_AUTH_TOKEN_OVERRIDE,
	});
	askAPIRef.current = askAPI;

	const {
		abortVoiceInput,
		handleMicPress,
		isListening,
		isMicStarting,
		isMicProcessing,
		isMicRestartBlocked,
		isTranscribing,
		resetVoiceInput,
		soundLevelAnim,
	} = useMicrophone({
		messages,
		setMessages,
		isLoading,
		isGenerating,
		isAudioPlaying,
		showTextInput,
		isSpeechInputUnavailable,
		serverUrl: API_URL,
		authTokenOverride: CHAT_AUTH_TOKEN_OVERRIDE,
		getTranscriptionThreadId: (signal) => ensureThread('Wiadomość głosowa', signal),
		setShowTextInput,
		setIsLoading,
		onStopExternal: () => {
			stopChatApi();
			stopAssistantAudio();
		},
		onTranscript: (transcript, messageId) => {
			const photoUris = pendingPhotoUris;
			if (photoUris.length > 0) {
				setMessages((currentMessages) =>
					currentMessages.map((message) =>
						message.id === messageId
							? { ...message, attachedPhotoUris: photoUris }
							: message,
					),
				);
			}
			setPendingPhotoUris([]);
			askAPIRef.current(transcript, photoUris);
		},
		onServiceError: showServiceError,
		onSpeechInputError: handleSpeechInputError,
	});

	useFocusEffect(
		useCallback(() => {
			setIsChatFocused(true);

			return () => {
				setIsChatFocused(false);
				stopChatApi();
				stopAssistantAudio();
				abortVoiceInput();
			};
		}, [abortVoiceInput, stopAssistantAudio, stopChatApi]),
	);

	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextState) => {
			isAppActiveRef.current = nextState === 'active';
			if (nextState !== 'active') {
				resetKeyboardUi();
			}
		});

		return () => subscription.remove();
	}, [resetKeyboardUi]);

	useEffect(() => {
		const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
			if (!isAppActiveRef.current || !keyboardInteractionAllowedRef.current) return;
			setKeyboardFrame({
				screenY: event.endCoordinates.screenY,
				height: event.endCoordinates.height,
			});
		});
		const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
			setKeyboardFrame(null);
			if (!hasStartedChat) {
				setShowTextInput(false);
			}
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, [hasStartedChat, setShowTextInput]);

	useEffect(() => {
		const abortController = new AbortController();

		const fetchAvailableFiles = async () => {
			setIsAvailableFilesLoading(true);

			try {
				if (!selectedDeviceId) {
					setAvailableFiles([]);
					return;
				}
				if (API_URL_CONFIG_ERROR) throw API_URL_CONFIG_ERROR;
				const authToken = CHAT_AUTH_TOKEN_OVERRIDE ?? getAuthTokenOrThrow();

				const response = await fetchWithRetry(
					`${API_URL}/api/devices/${selectedDeviceId}/attachments`,
					{
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${authToken}`,
						},
						signal: abortController.signal,
					},
				);

				if (!response.ok) {
					throwIfAuthResponseError(response);
					throw new HttpError(
						response.status,
						`Failed to load attachments: ${response.status}`,
					);
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
							remoteUrl: `${API_URL}/api/attachments/${attachment.id}/file`,
						};
					}),
				);
			} catch (error: any) {
				if (error.name !== 'AbortError') {
					console.log('Handled available files load error:', error);
					showServiceError(getServiceErrorFeature(error, 'lista plików'), error);
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
	}, [reconnectCount, selectedDeviceId, showServiceError]);

	useEffect(() => {
		const abortController = new AbortController();

		stopChatApi();
		stopAssistantAudio();
		resetVoiceInput();
		cancelDownload();

		setCurrentThreadId(null);
		setMessages([]);
		setInputText('');
		setShowTextInput(false);
		setCurrentImage(null);
		setNameplateData(null);
		setIsMachineInfoVisible(false);
		setIsPhotoCaptureVisible(false);
		setPendingPhotoUris([]);
		setIsGenerating(false);
		setIsLoading(Boolean(threadId));

		const loadThreadMessages = async () => {
			if (!threadId) return;

			const parsedThreadId = Number(threadId);
			if (!Number.isFinite(parsedThreadId)) {
				setIsLoading(false);
				return;
			}

			try {
				if (API_URL_CONFIG_ERROR) throw API_URL_CONFIG_ERROR;
				const authToken = CHAT_AUTH_TOKEN_OVERRIDE ?? getAuthTokenOrThrow();

				const requestOptions = {
					headers: {
						Accept: 'application/json',
						Authorization: `Bearer ${authToken}`,
					},
					signal: abortController.signal,
				};
				const [threadResponse, messagesResponse] = await Promise.all([
					fetchWithRetry(`${API_URL}/api/threads/${parsedThreadId}`, requestOptions),
					fetchWithRetry(
						`${API_URL}/api/threads/${parsedThreadId}/messages`,
						requestOptions,
					),
				]);

				if (!threadResponse.ok) {
					throwIfAuthResponseError(threadResponse);
					throw new HttpError(
						threadResponse.status,
						`Failed to load thread: ${threadResponse.status}`,
					);
				}
				if (!messagesResponse.ok) {
					throwIfAuthResponseError(messagesResponse);
					throw new HttpError(
						messagesResponse.status,
						`Failed to load thread messages: ${messagesResponse.status}`,
					);
				}

				const thread = (await threadResponse.json()) as ChatThreadWithNameplate;
				const threadMessages = (await messagesResponse.json()) as ThreadMessagePayload[];

				setCurrentThreadId(parsedThreadId);
				setNameplateData(thread.nameplate_data ?? null);
				setMessages(
					threadMessages.map((message) => ({
						id: message.id,
						sender: message.sender === 'user' ? 'user' : 'ai',
						text: message.content,
						hasContinuation: message.has_continuation,
					})),
				);
			} catch (error: any) {
				if (error.name !== 'AbortError') {
					console.log('Handled thread messages load error:', error);
					showServiceError(getServiceErrorFeature(error, 'historia wątku'), error);
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		};

		loadThreadMessages();

		return () => abortController.abort();
	}, [
		cancelDownload,
		resetVoiceInput,
		sessionKey,
		setCurrentImage,
		setShowTextInput,
		showServiceError,
		stopAssistantAudio,
		stopChatApi,
		threadId,
	]);

	const handleStop = () => {
		stopChatApi();
		stopAssistantAudio();
		abortVoiceInput();
	};

	const handleBack = () => {
		handleStop();
		router.push('/home');
	};

	const handleSendText = () => {
		const trimmedInput = inputText.trim();
		if (trimmedInput.length === 0) return;

		handleStop();
		const photoUris = pendingPhotoUris;

		setMessages((prev) => [
			...prev,
			{
				id: Date.now(),
				sender: 'user',
				text: trimmedInput,
				attachedPhotoUris: photoUris,
				isSpeaking: false,
			},
		]);
		setPendingPhotoUris([]);
		askAPI(trimmedInput, photoUris);
		setInputText('');
		setShowTextInput(false);
	};

	const handleRetryMessage = (message: ChatMessage) => {
		const question = message.retryQuestion?.trim();
		if (!question || isLoading || isGenerating || retryInProgressRef.current) return;

		retryInProgressRef.current = true;
		handleStop();
		const photoUris = message.retryPhotoUris ?? [];
		setMessages((currentMessages) => [
			...currentMessages.filter((currentMessage) => currentMessage.id !== message.id),
			{
				id: Date.now(),
				sender: 'user',
				text: question,
				attachedPhotoUris: photoUris,
				isSpeaking: false,
			},
		]);

		void askAPI(question, photoUris).finally(() => {
			retryInProgressRef.current = false;
		});
	};

	const handleContinueMessage = () => {
		if (isLoading || isGenerating) return;

		const question = 'Co dalej?';
		handleStop();
		setMessages((currentMessages) => [
			...currentMessages,
			{ id: Date.now(), sender: 'user', text: question, isSpeaking: false },
		]);
		void askAPI(question);
	};

	const handleMicPressWithFeedback = () => {
		if (isMicRestartBlocked) return;

		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

		if (isMicProcessing) {
			handleStop();
			return;
		}

		if (isSpeechInputUnavailable && !isListening) {
			showServiceError('rozpoznawanie mowy', new Error('Speech input is unavailable'));
			return;
		}

		setIsMicrophoneActivated(true);
		void handleMicPress();
	};

	const handleMicrophoneCancel = () => {
		setIsMicrophoneActivated(false);
		handleStop();
	};

	useEffect(() => {
		if (!isMicrophoneActivated) return;

		const hasVoiceActivity =
			isMicStarting ||
			isListening ||
			isTranscribing ||
			messages.some((message) => message.isSpeaking);
		const hasVoiceRequestActivity =
			hasVoiceActivity || isLoading || isGenerating || isAudioPlaying;

		if (!hasVoiceRequestActivity) setIsMicrophoneActivated(false);
	}, [
		isAudioPlaying,
		isGenerating,
		isListening,
		isLoading,
		isMicStarting,
		isMicrophoneActivated,
		isTranscribing,
		messages,
	]);

	const handleWakeWordDetected = useCallback(() => {
		void handleMicPress();
	}, [handleMicPress]);

	useWakeWord({
		enabled:
			isChatFocused &&
			wakeWordEnabled &&
			!isListening &&
			!isMicStarting &&
			!isLoading &&
			!isTranscribing &&
			!isGenerating &&
			!isAudioPlaying &&
			!isMicRestartBlocked &&
			!isSpeechInputUnavailable,
		onDetected: handleWakeWordDetected,
	});

	const handleWritingPress = () => {
		if (showTextInput) {
			startPromptInputRef.current?.blur();
			Keyboard.dismiss();
			setShouldFocusStartPromptInput(false);
			setShowTextInput(false);
			return;
		}

		setShowTextInput(true);
		if (!hasStartedChat) {
			setShouldFocusStartPromptInput(true);
		}
	};

	const handleCameraPress = () => {
		if (pendingPhotoUris.length >= MAX_CHAT_PHOTOS) return;
		handleStop();
		Keyboard.dismiss();
		setIsPhotoCaptureVisible(true);
	};

	const handlePhotoCaptured = (photoUri: string) => {
		setPendingPhotoUris((currentUris) => {
			if (currentUris.length >= MAX_CHAT_PHOTOS || currentUris.includes(photoUri)) {
				return currentUris;
			}
			return [...currentUris, photoUri];
		});
		setShowTextInput(true);
		if (!hasStartedChat) {
			setShouldFocusStartPromptInput(true);
		}
	};

	const openSchemaFullscreen = useCallback(
		(imageSource: SchemaImageSource, title?: string) => {
			if (isWeb && !isPortrait) {
				sourcePanelProps.onClose();
				setIsMachineInfoVisible(false);
				setDesktopSchemaPreview({ imageUrl: imageSource, title });
				return;
			}

			schemaViewerRef.current?.open(imageSource, title);
		},
		[isPortrait, isWeb, sourcePanelProps],
	);
	const openMessageSourceAlongsideChat = useCallback(
		(source: ChatMessage | ChatMessageSourceReference) => {
			setDesktopSchemaPreview(null);
			setIsMachineInfoVisible(false);
			void openMessageSource(source);
		},
		[openMessageSource],
	);

	const commonLayoutProps = {
		lightMode: lightThemeEnabled,
		hideControlPanel: isWeb,
		currentSource,
		logoUrl,
		isTablet,
		height,
		keyboardFrame,
		hasStartedChat,
		showTextInput,
		inputText,
		messages,
		reserveMessageScrollSpace:
			isLoading || isGenerating || messages[messages.length - 1]?.sender === 'user',
		shouldFocusStartPromptInput,
		isListening,
		isMicStarting,
		isMicProcessing,
		isMicrophoneActivated,
		isMicRestartBlocked,
		isSpeechInputUnavailable,
		isVoiceOutputUnavailable,
		soundLevelAnim,
		currentImageAspectRatio: 1,
		desktopSchemaPreview,
		onCloseDesktopSchema: () => setDesktopSchemaPreview(null),
		enableDesktopPreview: useDesktopSidePreview,
		startPromptInputRef,
		messagesScrollViewRef,
		sourcePanelProps,
		machineInfoPanelProps: {
			showMachineInfoPanel: isMachineInfoVisible,
			deviceName: currentSource,
			nameplateData,
			onClose: () => setIsMachineInfoVisible(false),
		},
		sourcePanelFullScreen,
		onBack: handleBack,
		onOpenMachineInfo: openMachineInfoPanel,
		onOpenFilesPanel: openFilesPanelWithoutMachineInfo,
		onSendText: handleSendText,
		onChangeText: setInputText,
		onShowTextInputChange: setShowTextInput,
		onShouldFocusStartPromptInputChange: setShouldFocusStartPromptInput,
		onOpenSchema: openSchemaFullscreen,
		onOpenSource: openMessageSourceAlongsideChat,
		onRetryMessage: handleRetryMessage,
		onContinueMessage: handleContinueMessage,
		isRetryDisabled: isLoading || isGenerating,
		onUserMessageLayout: handleUserMessageLayout,
		pendingPhotoUris,
		onRemovePendingPhoto: (photoUri: string) =>
			setPendingPhotoUris((currentUris) => currentUris.filter((uri) => uri !== photoUri)),
		onMicPress: handleMicPressWithFeedback,
		onMicCancel: handleMicrophoneCancel,
		onCameraPress: handleCameraPress,
		onWritingPress: handleWritingPress,
	};

	const photoCaptureModal = (
		<NameplateScannerModal
			visible={isPhotoCaptureVisible}
			lightMode={lightThemeEnabled}
			mode='photo'
			onClose={() => setIsPhotoCaptureVisible(false)}
			onPhotoCaptured={handlePhotoCaptured}
			onServiceError={showServiceError}
		/>
	);

	if (isPortrait) {
		return (
			<View style={{ flex: 1 }}>
				<StatusBar style={lightThemeEnabled ? 'dark' : 'light'} />
				<PortraitChatLayout {...commonLayoutProps} insets={insets} />
				{photoCaptureModal}
				<ServiceErrorModal
					visible={Boolean(serviceErrorFeature)}
					featureName={serviceErrorFeature || 'wybrana funkcja'}
					onClose={() => setServiceErrorFeature(null)}
					lightMode={lightThemeEnabled}
				/>
				{isWeb && desktopSchemaPreview ? (
					<View className='absolute inset-0' style={{ zIndex: 50, elevation: 50 }}>
						<FullscreenSchemaView
							lightMode={lightThemeEnabled}
							imageUrl={desktopSchemaPreview.imageUrl}
							title={desktopSchemaPreview.title}
							aspectRatio={1}
							insets={insets}
							isTablet={isTablet}
							onBack={() => setDesktopSchemaPreview(null)}
						/>
					</View>
				) : null}
				<FullscreenSchemaOverlay
					ref={schemaViewerRef}
					lightMode={lightThemeEnabled}
					insets={insets}
					isTablet={isTablet}
				/>
			</View>
		);
	}

	return (
		<View style={{ flex: 1 }}>
			<StatusBar style={lightThemeEnabled ? 'dark' : 'light'} />
			<DesktopChatLayout {...commonLayoutProps} />
			{photoCaptureModal}
			<ServiceErrorModal
				visible={Boolean(serviceErrorFeature)}
				featureName={serviceErrorFeature || 'wybrana funkcja'}
				onClose={() => setServiceErrorFeature(null)}
				lightMode={lightThemeEnabled}
			/>
			{!isWeb ? (
				<FullscreenSchemaOverlay
					ref={schemaViewerRef}
					lightMode={lightThemeEnabled}
					insets={insets}
					isTablet={isTablet}
				/>
			) : null}
		</View>
	);
}
