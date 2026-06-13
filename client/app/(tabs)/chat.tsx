import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	Image,
	Keyboard,
	Platform,
	ScrollView,
	TextInput,
	useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
	DesktopChatLayout,
	FullscreenSchemaView,
	PortraitChatLayout,
} from '@/components/ChatLayouts';
import ServiceErrorModal from '@/components/ServiceErrorModal';
import type { KeyboardFrame } from '@/components/StartPromptView';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAssistantAudio } from '@/hooks/use-assistant-audio';
import { useChatApi } from '@/hooks/use-chat-api';
import { useMicrophone } from '@/hooks/use-microphone';
import { useSourcePanelFiles } from '@/hooks/use-source-panel-files';
import { useWakeWord } from '@/hooks/use-wake-word';
import type { AvailableFile, Message } from '@/types/chat';
import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';

const CHAT_AUTH_TOKEN_OVERRIDE: string | null = null;

type ChatMessage = Message & {
	schemaImage?: string;
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
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
const FILE_ICON_OPTIONS = [
	{ icon: 'file-pdf-box', color: '#EF4444' },
	{ icon: 'file-document-outline', color: '#06B6D4' },
	{ icon: 'lightning-bolt', color: '#EAB308' },
	{ icon: 'cogs', color: '#A855F7' },
	{ icon: 'wrench-outline', color: '#3B82F6' },
	{ icon: 'shield-check-outline', color: '#22C55E' },
];

/**
 * ChatScreen Component
 *
 * Handles the main conversational interface, supporting both text and voice interactions.
 * Features include:
 * - Real-time voice recording with volume metering
 * - Server-side Speech-to-Text (STT)
 * - Integration with OpenAI for Text-to-Speech (TTS)
 * - Managing thread-based conversation history with the backend API
 * - Displaying attachments and schema images
 */
export default function ChatScreen() {
	const { width, height } = useWindowDimensions();
	const isPortrait = height > width;
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { wakeWordEnabled, ttsEnabled } = useAppSettings();

	const { deviceId, deviceName, logoUrl, chatSession, threadId } = useLocalSearchParams<{
		deviceId: string;
		deviceName: string;
		logoUrl: string;
		chatSession: string;
		threadId?: string;
	}>();
	const sessionKey = `${deviceId ?? ''}:${chatSession ?? ''}:${threadId ?? ''}`;
	const currentSource = deviceName || 'Wybierz maszynę';

	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [availableFiles, setAvailableFiles] = useState<AvailableFile[]>([]);
	const [isAvailableFilesLoading, setIsAvailableFilesLoading] = useState<boolean>(true);
	const [showTextInput, setShowTextInput] = useState<boolean>(false);
	const [inputText, setInputText] = useState<string>('');
	const [shouldFocusStartPromptInput, setShouldFocusStartPromptInput] = useState<boolean>(false);
	const [keyboardFrame, setKeyboardFrame] = useState<KeyboardFrame | null>(null);
	const [currentImage, setCurrentImage] = useState<string | null>(null);
	const [currentImageAspectRatio, setCurrentImageAspectRatio] = useState<number>(1);
	const [showFullscreenSchema, setShowFullscreenSchema] = useState<boolean>(false);
	const [currentThreadId, setCurrentThreadId] = useState<number | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [serviceErrorFeature, setServiceErrorFeature] = useState<string | null>(null);
	const [isSpeechInputUnavailable, setIsSpeechInputUnavailable] = useState<boolean>(false);
	const [isVoiceOutputUnavailable, setIsVoiceOutputUnavailable] = useState<boolean>(false);

	const hasStartedChat = messages.length > 0 || Boolean(threadId);
	const messagesScrollViewRef = useRef<ScrollView>(null);
	const startPromptInputRef = useRef<TextInput>(null);
	const askAPIRef = useRef<(question: string) => void>(() => undefined);
	const hasShownOpenAiKeyErrorRef = useRef<boolean>(false);
	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		setServiceErrorFeature(featureName);
	}, []);
	const handleOpenAiKeyError = useCallback(
		(error: unknown) => {
			console.log('Handled OpenAI API key error:', error);
			setIsVoiceOutputUnavailable(true);

			if (hasShownOpenAiKeyErrorRef.current) return;

			hasShownOpenAiKeyErrorRef.current = true;
			showServiceError('odtwarzanie odpowiedzi głosowej', error);
		},
		[showServiceError],
	);
	const handleSpeechInputError = useCallback((error: unknown) => {
		console.log('Handled speech input error:', error);
		setIsSpeechInputUnavailable(true);
	}, []);

	const { isAudioPlaying, playAssistantAudio, stopAssistantAudio } = useAssistantAudio({
		setIsLoading,
		setIsGenerating,
		onServiceError: showServiceError,
		onOpenAiKeyError: handleOpenAiKeyError,
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
	const { askAPI, ensureThread, stopChatApi } = useChatApi<ChatMessage>({
		serverUrl: AUTH_URL,
		deviceId: HARDCODED_DEVICE_ID,
		currentThreadId,
		setCurrentThreadId,
		setMessages,
		setIsLoading,
		setIsGenerating,
		setCurrentImage,
		playAssistantAudio: playAssistantAudioWhenEnabled,
		onServiceError: showServiceError,
		authTokenOverride: CHAT_AUTH_TOKEN_OVERRIDE,
	});
	askAPIRef.current = askAPI;

	const {
		abortVoiceInput,
		handleMicPress,
		isListening,
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

		const fetchAvailableFiles = async () => {
			setIsAvailableFilesLoading(true);

			try {
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = CHAT_AUTH_TOKEN_OVERRIDE ?? getAuthTokenOrThrow();

				const response = await fetch(
					`${AUTH_URL}/api/devices/${HARDCODED_DEVICE_ID}/attachments`,
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
	}, [showServiceError]);

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

				const response = await fetch(`${AUTH_URL}/api/threads/${parsedThreadId}/messages`, {
					headers: {
						Accept: 'application/json',
						Authorization: `Bearer ${authToken}`,
					},
					signal: abortController.signal,
				});

				if (!response.ok) {
					throwIfAuthResponseError(response);
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
		showServiceError,
		stopAssistantAudio,
		stopChatApi,
		threadId,
	]);

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

	const handleStop = () => {
		stopChatApi();
		stopAssistantAudio();
		abortVoiceInput();
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
			wakeWordEnabled &&
			!isListening &&
			!isLoading &&
			!isTranscribing &&
			!isGenerating &&
			!isAudioPlaying &&
			!isMicRestartBlocked &&
			!isSpeechInputUnavailable,
		onDetected: handleWakeWordDetected,
	});

	const handleWritingPress = () => {
		if (hasStartedChat) {
			setShowTextInput((visible) => !visible);
			return;
		}

		setShowTextInput(true);
		setShouldFocusStartPromptInput(true);
	};

	const openSchemaFullscreen = (imageUrl: string) => {
		setCurrentImage(imageUrl);
		setShowFullscreenSchema(true);
	};

	const commonLayoutProps = {
		currentSource,
		logoUrl,
		height,
		keyboardFrame,
		hasStartedChat,
		showTextInput,
		inputText,
		messages,
		isListening,
		isMicProcessing,
		isMicRestartBlocked,
		isSpeechInputUnavailable,
		isVoiceOutputUnavailable,
		soundLevelAnim,
		currentImageAspectRatio,
		startPromptInputRef,
		messagesScrollViewRef,
		sourcePanelProps,
		onBack: () => router.push('/home'),
		onOpenMachineInfo: sourcePanelProps.onClose,
		onOpenFilesPanel: openFilesPanel,
		onSendText: handleSendText,
		onChangeText: setInputText,
		onShowTextInputChange: setShowTextInput,
		onShouldFocusStartPromptInputChange: setShouldFocusStartPromptInput,
		onOpenSchema: openSchemaFullscreen,
		onOpenSource: openMessageSource,
		onMicPress: handleMicPressWithFeedback,
		onWritingPress: handleWritingPress,
	};

	if (showFullscreenSchema && currentImage) {
		return (
			<>
				<FullscreenSchemaView
					imageUrl={currentImage}
					aspectRatio={currentImageAspectRatio}
					insets={insets}
					onBack={() => setShowFullscreenSchema(false)}
				/>
				<ServiceErrorModal
					visible={Boolean(serviceErrorFeature)}
					featureName={serviceErrorFeature || 'wybrana funkcja'}
					onClose={() => setServiceErrorFeature(null)}
				/>
			</>
		);
	}

	if (isPortrait) {
		return (
			<>
				<PortraitChatLayout {...commonLayoutProps} insets={insets} />
				<ServiceErrorModal
					visible={Boolean(serviceErrorFeature)}
					featureName={serviceErrorFeature || 'wybrana funkcja'}
					onClose={() => setServiceErrorFeature(null)}
				/>
			</>
		);
	}

	return (
		<>
			<DesktopChatLayout {...commonLayoutProps} />
			<ServiceErrorModal
				visible={Boolean(serviceErrorFeature)}
				featureName={serviceErrorFeature || 'wybrana funkcja'}
				onClose={() => setServiceErrorFeature(null)}
			/>
		</>
	);
}
