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
} from '@/components/ChatLayouts';
import type { ChatMessageSourceReference, SchemaImageSource } from '@/components/ChatMessages';
import ServiceErrorModal from '@/components/ServiceErrorModal';
import type { KeyboardFrame } from '@/components/StartPromptView';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAssistantAudio } from '@/hooks/use-assistant-audio';
import { useChatApi } from '@/hooks/use-chat-api';
import { useMicrophone } from '@/hooks/use-microphone';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useSourcePanelFiles } from '@/hooks/use-source-panel-files';
import { useWakeWord } from '@/hooks/use-wake-word';
import type { AvailableFile, Message } from '@/types/chat';
import type { ChatThreadWithNameplate, NameplateData } from '@/types/nameplate';
import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
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

type FullscreenSchemaOverlayHandle = {
	prepare: (imageSource: SchemaImageSource | null) => void;
	open: (imageSource: SchemaImageSource) => void;
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
	const [visible, setVisible] = useState(false);

	useImperativeHandle(
		ref,
		() => ({
			prepare: (nextImageUrl) => {
				setImageUrl(nextImageUrl);
				if (!nextImageUrl) setVisible(false);
			},
			open: (nextImageUrl) => {
				setImageUrl(nextImageUrl);
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
			pointerEvents={visible ? 'auto' : 'none'}
			accessibilityElementsHidden={!visible}
			importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
			style={[
				StyleSheet.absoluteFill,
				{
					elevation: visible ? 1000 : 0,
					opacity: visible ? 1 : 0,
					zIndex: visible ? 1000 : -1,
				},
			]}>
			<FullscreenSchemaView
				lightMode={lightMode}
				imageUrl={imageUrl}
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
	const sourcePanelFullScreen = isPortrait;
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { lightThemeEnabled, wakeWordEnabled, ttsEnabled, diagnosticModeEnabled } =
		useAppSettings();

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
	const [showTextInput, setShowTextInput] = useState<boolean>(false);
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
	const { reconnectCount } = useNetworkStatus();

	const hasStartedChat = messages.length > 0;
	const messagesScrollViewRef = useRef<ScrollView>(null);
	const startPromptInputRef = useRef<TextInput>(null);
	const retryInProgressRef = useRef(false);
	const askAPIRef = useRef<(question: string) => void>(() => undefined);
	const schemaViewerRef = useRef<FullscreenSchemaOverlayHandle>(null);
	const currentImageRef = useRef<SchemaImageSource | null>(null);
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
			serverUrl: AUTH_URL,
			onServiceError: showServiceError,
			authTokenOverride: CHAT_AUTH_TOKEN_OVERRIDE,
		});
	const openMachineInfoPanel = useCallback(() => {
		sourcePanelProps.onClose();
		setIsMachineInfoVisible(true);
	}, [sourcePanelProps]);
	const openFilesPanelWithoutMachineInfo = useCallback(() => {
		setIsMachineInfoVisible(false);
		openFilesPanel();
	}, [openFilesPanel]);

	const { askAPI, ensureThread, stopChatApi } = useChatApi<ChatMessage>({
		serverUrl: AUTH_URL,
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
		serverUrl: AUTH_URL,
		authTokenOverride: CHAT_AUTH_TOKEN_OVERRIDE,
		getTranscriptionThreadId: (signal) => ensureThread('Wiadomość głosowa', signal),
		setShowTextInput,
		setIsLoading,
		onStopExternal: () => {
			stopChatApi();
			stopAssistantAudio();
		},
		onTranscript: (transcript) => askAPIRef.current(transcript),
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

		const fetchAvailableFiles = async () => {
			setIsAvailableFilesLoading(true);

			try {
				if (!selectedDeviceId) {
					setAvailableFiles([]);
					return;
				}
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = CHAT_AUTH_TOKEN_OVERRIDE ?? getAuthTokenOrThrow();

				const response = await fetchWithRetry(
					`${AUTH_URL}/api/devices/${selectedDeviceId}/attachments`,
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
							remoteUrl: `${AUTH_URL}/api/attachments/${attachment.id}/file`,
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
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = CHAT_AUTH_TOKEN_OVERRIDE ?? getAuthTokenOrThrow();

				const requestOptions = {
					headers: {
						Accept: 'application/json',
						Authorization: `Bearer ${authToken}`,
					},
					signal: abortController.signal,
				};
				const [threadResponse, messagesResponse] = await Promise.all([
					fetchWithRetry(`${AUTH_URL}/api/threads/${parsedThreadId}`, requestOptions),
					fetchWithRetry(
						`${AUTH_URL}/api/threads/${parsedThreadId}/messages`,
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

		setMessages((prev) => [
			...prev,
			{ id: Date.now(), sender: 'user', text: trimmedInput, isSpeaking: false },
		]);
		askAPI(trimmedInput);
		setInputText('');
		setShowTextInput(false);
	};

	const handleRetryMessage = (message: ChatMessage) => {
		const question = message.retryQuestion?.trim();
		if (!question || isLoading || isGenerating || retryInProgressRef.current) return;

		retryInProgressRef.current = true;
		handleStop();
		setMessages((currentMessages) => [
			...currentMessages.filter((currentMessage) => currentMessage.id !== message.id),
			{ id: Date.now(), sender: 'user', text: question, isSpeaking: false },
		]);

		void askAPI(question).finally(() => {
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

		void handleMicPress();
	};

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

	const openSchemaFullscreen = useCallback((imageSource: SchemaImageSource) => {
		schemaViewerRef.current?.open(imageSource);
	}, []);

	const commonLayoutProps = {
		lightMode: lightThemeEnabled,
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
		isMicRestartBlocked,
		isSpeechInputUnavailable,
		isVoiceOutputUnavailable,
		soundLevelAnim,
		currentImageAspectRatio: 1,
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
		onOpenSource: openMessageSource,
		onRetryMessage: handleRetryMessage,
		onContinueMessage: handleContinueMessage,
		isRetryDisabled: isLoading || isGenerating,
		onUserMessageLayout: handleUserMessageLayout,
		onMicPress: handleMicPressWithFeedback,
		onWritingPress: handleWritingPress,
	};

	if (isPortrait) {
		return (
			<View style={{ flex: 1 }}>
				<StatusBar style={lightThemeEnabled ? 'dark' : 'light'} />
				<PortraitChatLayout {...commonLayoutProps} insets={insets} />
				<ServiceErrorModal
					visible={Boolean(serviceErrorFeature)}
					featureName={serviceErrorFeature || 'wybrana funkcja'}
					onClose={() => setServiceErrorFeature(null)}
					lightMode={lightThemeEnabled}
				/>
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
			<ServiceErrorModal
				visible={Boolean(serviceErrorFeature)}
				featureName={serviceErrorFeature || 'wybrana funkcja'}
				onClose={() => setServiceErrorFeature(null)}
				lightMode={lightThemeEnabled}
			/>
			<FullscreenSchemaOverlay
				ref={schemaViewerRef}
				lightMode={lightThemeEnabled}
				insets={insets}
				isTablet={isTablet}
			/>
		</View>
	);
}
