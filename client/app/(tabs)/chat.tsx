import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
import type { KeyboardFrame } from '@/components/StartPromptView';
import { useAssistantAudio } from '@/hooks/use-assistant-audio';
import { useChatApi } from '@/hooks/use-chat-api';
import { useMicrophone } from '@/hooks/use-microphone';
import { useSourcePanelFiles } from '@/hooks/use-source-panel-files';
import type { AvailableFile, Message } from '@/types/chat';

const SERVER_URL = 'https://staging.asystent-serwisanta.pl';

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

	const hasStartedChat = messages.length > 0 || Boolean(threadId);
	const messagesScrollViewRef = useRef<ScrollView>(null);
	const startPromptInputRef = useRef<TextInput>(null);
	const askAPIRef = useRef<(question: string) => void>(() => undefined);

	const { isAudioPlaying, playAssistantAudio, stopAssistantAudio } = useAssistantAudio({
		setIsLoading,
		setIsGenerating,
	});
	const { cancelDownload, openFilesPanel, openMessageSource, sourcePanelProps } =
		useSourcePanelFiles({
			availableFiles,
			isAvailableFilesLoading,
			serverUrl: SERVER_URL,
		});
	const { askAPI, stopChatApi } = useChatApi<ChatMessage>({
		serverUrl: SERVER_URL,
		deviceId: HARDCODED_DEVICE_ID,
		currentThreadId,
		setCurrentThreadId,
		setMessages,
		setIsLoading,
		setIsGenerating,
		setCurrentImage,
		playAssistantAudio,
	});
	askAPIRef.current = askAPI;

	const {
		abortVoiceInput,
		handleMicPress,
		isListening,
		isMicProcessing,
		isMicRestartBlocked,
		resetVoiceInput,
		soundLevelAnim,
	} = useMicrophone({
		messages,
		setMessages,
		isLoading,
		isGenerating,
		isAudioPlaying,
		showTextInput,
		setShowTextInput,
		setIsLoading,
		onStopExternal: () => {
			stopChatApi();
			stopAssistantAudio();
		},
		onTranscript: (transcript) => askAPIRef.current(transcript),
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
	}, [cancelDownload, resetVoiceInput, sessionKey, stopAssistantAudio, stopChatApi, threadId]);

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

		void handleMicPress();
	};

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
			<FullscreenSchemaView
				imageUrl={currentImage}
				aspectRatio={currentImageAspectRatio}
				insets={insets}
				onBack={() => setShowFullscreenSchema(false)}
			/>
		);
	}

	if (isPortrait) {
		return <PortraitChatLayout {...commonLayoutProps} insets={insets} />;
	}

	return <DesktopChatLayout {...commonLayoutProps} />;
}
