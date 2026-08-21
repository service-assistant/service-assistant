import React from 'react';

import { collectElements, findByText, findByType, getTextContent } from '../test-utils/react-tree';

const mockRouterPush = jest.fn();
let mockSearchParams: Record<string, string | undefined> = {};
let mockWindowDimensions = { width: 900, height: 700 };
const mockSafeAreaInsets = { top: 10, right: 0, bottom: 12, left: 0 };
const mockUseColorScheme = jest.fn(() => 'light');
const mockUseAssistantAudio = jest.fn();
const mockUseChatApi = jest.fn();
const mockUseMicrophone = jest.fn();
const mockUseSourcePanelFiles = jest.fn();
const mockUseWakeWord = jest.fn();
const mockLogout = jest.fn(() => Promise.resolve());
const mockUseAuth = jest.fn(() => ({
	authenticated: true,
	user: {
		id: 1,
		organizationId: 1,
		organizationSlug: 'serwis',
		username: 'andrzej',
		role: 'member',
	},
	login: jest.fn(),
	logout: mockLogout,
}));
const mockUseFocusEffect = jest.fn((callback: () => void | (() => void)) => callback());
const mockUseCameraPermissions = jest.fn(() => [{ granted: true }, jest.fn()]);
const mockImpactAsync = jest.fn(() => Promise.resolve());
const mockSelectionAsync = jest.fn(() => Promise.resolve());
const mockOrientationLockAsync = jest.fn(() => Promise.resolve());
const mockOrientationUnlockAsync = jest.fn(() => Promise.resolve());
const mockImageGetSize = jest.fn();
const mockKeyboardAddListener = jest.fn(() => ({ remove: jest.fn() }));
const mockKeyboardDismiss = jest.fn();
const mockAppStateAddListener = jest.fn(
	(_eventName: string, _listener: (state: string) => void) => ({ remove: jest.fn() }),
);
const mockAnimatedValueSetValue = jest.fn();
const mockAnimatedInterpolate = jest.fn(() => 'interpolated');
const mockAnimatedStopAnimation = jest.fn();
let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');
	return {
		...actualReact,
		useCallback: (callback: unknown) => callback,
		useEffect: (callback: () => void | (() => void)) => callback(),
		useRef: (initialValue: unknown) => ({ current: initialValue }),
		useState: (initialValue: unknown) => {
			const stateIndex = mockReactStateIndex;
			mockReactStateIndex += 1;

			if (mockReactStateValues.length <= stateIndex) {
				mockReactStateValues[stateIndex] =
					typeof initialValue === 'function' ? initialValue() : initialValue;
			}

			const setValue = (nextValue: unknown) => {
				mockReactStateValues[stateIndex] =
					typeof nextValue === 'function'
						? nextValue(mockReactStateValues[stateIndex])
						: nextValue;
			};
			return [mockReactStateValues[stateIndex], setValue];
		},
	};
});

jest.mock('@/hooks/use-network-status', () => ({
	useNetworkStatus: () => ({ isOffline: false, reconnectCount: 0 }),
}));

jest.mock('react-native', () => {
	const React = require('react');
	const createHost = (name: string) =>
		function HostComponent({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};
	const AnimatedView = createHost('Animated.View');
	const AnimatedFlatList = createHost('Animated.FlatList');

	return {
		ActivityIndicator: createHost('ActivityIndicator'),
		AppState: {
			currentState: 'active',
			addEventListener: mockAppStateAddListener,
		},
		BackHandler: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
		Animated: {
			View: AnimatedView,
			FlatList: AnimatedFlatList,
			Value: jest.fn(() => ({
				interpolate: mockAnimatedInterpolate,
				setValue: mockAnimatedValueSetValue,
				stopAnimation: mockAnimatedStopAnimation,
			})),
			event: jest.fn(() => 'animated-event'),
			loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
			sequence: jest.fn((animations) => animations),
			timing: jest.fn(() => ({ start: jest.fn() })),
		},
		Image: Object.assign(createHost('Image'), { getSize: mockImageGetSize }),
		Keyboard: { addListener: mockKeyboardAddListener, dismiss: mockKeyboardDismiss },
		KeyboardAvoidingView: createHost('KeyboardAvoidingView'),
		FlatList: createHost('FlatList'),
		Modal: createHost('Modal'),
		Pressable: createHost('Pressable'),
		Platform: {
			OS: 'ios',
			select: (options: Record<string, unknown>) => options.ios ?? options.default,
		},
		ScrollView: createHost('ScrollView'),
		StyleSheet: { absoluteFill: { position: 'absolute' } },
		Switch: createHost('Switch'),
		Text: createHost('Text'),
		TextInput: createHost('TextInput'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
		useWindowDimensions: () => mockWindowDimensions,
	};
});

jest.mock('react-native-safe-area-context', () => {
	const React = require('react');
	const SafeAreaView = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('SafeAreaView', props, children);

	return {
		SafeAreaView,
		useSafeAreaInsets: () => mockSafeAreaInsets,
	};
});

jest.mock('react-native-keyboard-controller', () => {
	const React = require('react');
	return {
		KeyboardAwareScrollView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('KeyboardAwareScrollView', props, children),
	};
});

jest.mock('react-native-gesture-handler', () => {
	const React = require('react');
	return {
		GestureHandlerRootView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('GestureHandlerRootView', props, children),
	};
});

jest.mock('expo-router', () => {
	const React = require('react');
	const Redirect = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Redirect', props, children);

	const Tabs = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Tabs', props, children);
	Tabs.Screen = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Tabs.Screen', props, children);

	return {
		Redirect,
		Tabs,
		useLocalSearchParams: () => mockSearchParams,
		useRouter: () => ({ push: mockRouterPush }),
	};
});

jest.mock('expo-status-bar', () => {
	const React = require('react');
	return {
		StatusBar: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('StatusBar', props, children),
	};
});

jest.mock('expo-camera', () => {
	const React = require('react');
	return {
		CameraView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('CameraView', props, children),
		useCameraPermissions: mockUseCameraPermissions,
	};
});

jest.mock('expo-haptics', () => ({
	ImpactFeedbackStyle: { Medium: 'medium' },
	impactAsync: mockImpactAsync,
	selectionAsync: mockSelectionAsync,
}));

jest.mock('expo-screen-orientation', () => ({
	OrientationLock: { PORTRAIT_UP: 'PORTRAIT_UP' },
	lockAsync: mockOrientationLockAsync,
	unlockAsync: mockOrientationUnlockAsync,
}));

jest.mock('expo-file-system/legacy', () => ({
	documentDirectory: 'file:///documents/',
	getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
	readAsStringAsync: jest.fn(() => Promise.resolve('')),
	writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-navigation/native', () => ({
	useFocusEffect: mockUseFocusEffect,
}));

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	const Icon = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Icon', props, children);

	return {
		Feather: Icon,
		MaterialCommunityIcons: Icon,
	};
});

jest.mock('@/components/chat/ChatLayouts', () => {
	const React = require('react');
	return {
		DesktopChatLayout: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('DesktopChatLayout', props, children),
		FullscreenSchemaView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('FullscreenSchemaView', props, children),
		PortraitChatLayout: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('PortraitChatLayout', props, children),
	};
});

jest.mock('@/components/feedback/ServiceErrorModal', () => {
	const React = require('react');
	return function MockServiceErrorModal({ children, ...props }: Record<string, unknown>) {
		return React.createElement('ServiceErrorModal', props, children);
	};
});

jest.mock('@/components/ui/haptic-tab', () => ({
	HapticTab: 'HapticTab',
}));

jest.mock('@/components/ui/icon-symbol', () => {
	const React = require('react');
	return {
		IconSymbol: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('IconSymbol', props, children),
	};
});

jest.mock('@/hooks/use-color-scheme', () => ({
	useColorScheme: mockUseColorScheme,
}));

jest.mock('@/hooks/use-assistant-audio', () => ({
	useAssistantAudio: mockUseAssistantAudio,
}));

jest.mock('@/hooks/use-chat-api', () => ({
	useChatApi: mockUseChatApi,
}));

jest.mock('@/hooks/use-microphone', () => ({
	useMicrophone: mockUseMicrophone,
}));

jest.mock('@/hooks/use-source-panel-files', () => ({
	useSourcePanelFiles: mockUseSourcePanelFiles,
}));

jest.mock('@/hooks/use-wake-word', () => ({
	useWakeWord: mockUseWakeWord,
}));

jest.mock('@/hooks/use-auth', () => ({
	useAuth: mockUseAuth,
}));

jest.mock('@/utils/api-config', () => ({
	API_URL: 'https://api.example.test',
	API_URL_CONFIG_ERROR: null,
	CONFIG_SERVICE_FEATURE: 'konfiguracja aplikacji',
}));

jest.mock('@/utils/auth-errors', () => ({
	AUTH_SERVICE_FEATURE: 'autoryzacja aplikacji',
	getAuthTokenOrThrow: jest.fn(() => 'test-token'),
	getServiceErrorFeature: jest.fn((_error, fallback) => fallback),
	throwIfAuthResponseError: jest.fn(),
}));

const createJsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const renderScreen = (Screen: React.ComponentType) => {
	mockReactStateIndex = 0;
	return <Screen />;
};

const setupChatHooks = () => {
	const playAssistantAudio = jest.fn();
	const stopAssistantAudio = jest.fn();
	const askAPI = jest.fn();
	const stopChatApi = jest.fn();
	const openFilesPanel = jest.fn();
	const openMessageSource = jest.fn();
	const cancelDownload = jest.fn();
	const handleMicPress = jest.fn();
	const abortVoiceInput = jest.fn();
	const resetVoiceInput = jest.fn();
	const sourcePanelProps = {
		showSourcePanel: false,
		sourcePanelPdf: null,
		isAvailableFilesLoading: false,
		availableFiles: [],
		isFileDownloading: false,
		downloadingFileId: null,
		downloadedFileIds: new Set(),
		onOpenFile: jest.fn(),
		onDeleteDownloadedFile: jest.fn(),
		onClose: jest.fn(),
	};

	mockUseAssistantAudio.mockReturnValue({
		isAudioPlaying: false,
		playAssistantAudio,
		stopAssistantAudio,
	});
	mockUseSourcePanelFiles.mockReturnValue({
		cancelDownload,
		openFilesPanel,
		openMessageSource,
		sourcePanelProps,
	});
	mockUseChatApi.mockReturnValue({ askAPI, stopChatApi });
	mockUseMicrophone.mockReturnValue({
		abortVoiceInput,
		handleMicPress,
		isListening: false,
		isMicStarting: false,
		isMicProcessing: false,
		isMicRestartBlocked: false,
		resetVoiceInput,
		soundLevelAnim: { interpolate: jest.fn(() => 'interpolated') },
	});

	return {
		abortVoiceInput,
		askAPI,
		cancelDownload,
		handleMicPress,
		openFilesPanel,
		openMessageSource,
		playAssistantAudio,
		resetVoiceInput,
		sourcePanelProps,
		stopAssistantAudio,
		stopChatApi,
	};
};

describe('tab screens', () => {
	beforeEach(() => {
		jest.resetModules();
		mockReactStateValues = [];
		mockReactStateIndex = 0;
		mockRouterPush.mockClear();
		mockUseFocusEffect.mockClear();
		mockUseCameraPermissions.mockClear();
		mockUseColorScheme.mockClear();
		mockUseAssistantAudio.mockReset();
		mockUseChatApi.mockReset();
		mockUseMicrophone.mockReset();
		mockUseSourcePanelFiles.mockReset();
		mockUseWakeWord.mockClear();
		mockUseAuth.mockClear();
		mockLogout.mockClear();
		mockKeyboardAddListener.mockClear();
		mockKeyboardDismiss.mockClear();
		mockAppStateAddListener.mockClear();
		mockAnimatedValueSetValue.mockClear();
		mockImpactAsync.mockClear();
		mockSelectionAsync.mockClear();
		mockOrientationLockAsync.mockClear();
		mockOrientationUnlockAsync.mockClear();
		mockImageGetSize.mockReset();
		mockImageGetSize.mockImplementation(
			(_uri: string, onSuccess: (width: number, height: number) => void) =>
				onSuccess(200, 100),
		);
		mockSearchParams = {};
		mockWindowDimensions = { width: 900, height: 700 };
		require('react-native').Platform.OS = 'ios';
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('tab layout hides the tab bar and status bar', () => {
		const TabLayout = require('../app/(tabs)/_layout').default;
		const tree = renderScreen(TabLayout);
		const elements = collectElements(tree);
		const statusBar = elements.find((element) => element.type === 'StatusBar');
		const tabs = elements.find((element) => element.type === 'Tabs');

		if (!statusBar || !tabs) {
			throw new Error('Tab layout did not render the expected root elements.');
		}
		expect(statusBar.props.hidden).toBe(true);
		expect(tabs.props.screenOptions).toMatchObject({
			headerShown: false,
		});
		expect(tabs.props.tabBar()).toBeNull();
		expect(mockOrientationUnlockAsync).toHaveBeenCalledTimes(1);
		expect(mockOrientationLockAsync).not.toHaveBeenCalled();
	});

	test('tab layout locks phones to portrait orientation', () => {
		mockWindowDimensions = { width: 390, height: 844 };
		const TabLayout = require('../app/(tabs)/_layout').default;

		collectElements(renderScreen(TabLayout));

		expect(mockOrientationLockAsync).toHaveBeenCalledWith('PORTRAIT_UP');
		expect(mockOrientationUnlockAsync).not.toHaveBeenCalled();
	});

	test('login tracks focused Android inputs above the keyboard', () => {
		require('react-native').Platform.OS = 'android';
		const LoginScreen = require('../app/login').default;
		const tree = renderScreen(LoginScreen);
		const keyboardAwareScrollView = findByType(tree, 'KeyboardAwareScrollView')[0];

		expect(keyboardAwareScrollView.props.enabled).toBe(true);
		expect(keyboardAwareScrollView.props.mode).toBe('insets');
		expect(keyboardAwareScrollView.props.bottomOffset).toBe(24);
		expect(keyboardAwareScrollView.props.keyboardShouldPersistTaps).toBe('handled');
		expect(keyboardAwareScrollView.props.contentContainerStyle).toMatchObject({
			flexGrow: 1,
			justifyContent: 'center',
		});
	});

	test('settings screen combines TTS state and voice in one expandable selector', () => {
		mockReactStateValues = [
			{
				lightThemeEnabled: false,
				wakeWordEnabled: false,
				ttsEnabled: false,
				ttsVoice: 'Algenib',
				ttsStyle: 'neutral',
				diagnosticModeEnabled: false,
			},
			{ top: 100, left: 16 },
			{ top: 280, left: 16 },
		];
		const SettingsScreen = require('../app/(tabs)/settings').default;
		const tree = renderScreen(SettingsScreen);
		const elements = collectElements(tree);
		const visibleText = elements
			.filter((element) => element.type === 'Text')
			.map((element) => getTextContent(element));
		const femaleVoiceOption = elements.find(
			(element) => element.props.accessibilityLabel === 'Leda',
		);
		const sensualStyleOption = elements.find(
			(element) => element.props.accessibilityLabel === 'Ekstra++',
		);

		expect(visibleText).toContain('Wyłączone');
		expect(visibleText).toContain('Algenib');
		expect(visibleText).toContain('Leda');
		expect(visibleText).toContain('Aoede');
		expect(visibleText).toContain('Vindemiatrix');
		expect(visibleText).toContain('Ekstra++');
		if (!femaleVoiceOption) throw new Error('Female TTS voice option was not rendered.');
		if (!sensualStyleOption) throw new Error('Sensual TTS style option was not rendered.');
		expect(femaleVoiceOption.props.onPressIn).toBeUndefined();
		expect(sensualStyleOption.props.onPressIn).toBeUndefined();

		femaleVoiceOption.props.onPress();
		sensualStyleOption.props.onPress();
		const { getAppSettings } = require('../hooks/use-app-settings');
		expect(getAppSettings()).toMatchObject({
			ttsEnabled: true,
			ttsVoice: 'Leda',
			ttsStyle: 'extreme_sensual',
		});
	});

	test.each(['web', 'android'])('settings screen exposes logout for %s sessions', async (os) => {
		require('react-native').Platform.OS = os;
		const SettingsScreen = require('../app/(tabs)/settings').default;
		const tree = renderScreen(SettingsScreen);
		const logoutButton = collectElements(tree).find(
			(element) => element.props.accessibilityLabel === 'Wyloguj się',
		);

		if (!logoutButton) throw new Error('Web logout button was not rendered.');
		expect(getTextContent(logoutButton)).toContain('andrzej · serwis');

		logoutButton.props.onPress();
		await flushPromises();

		expect(mockLogout).toHaveBeenCalledTimes(1);
	});

	test('chat screen renders desktop layout with chat params and hook wiring', () => {
		const hooks = setupChatHooks();
		mockSearchParams = {
			deviceId: '1',
			deviceName: 'Toyota 8FG',
			logoUrl: 'https://api.example.test/toyota.png',
			chatSession: 'abc',
		};
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const ChatScreen = require('../app/(tabs)/chat').default;

		const tree = renderScreen(ChatScreen);
		const layout = findByType(tree, 'DesktopChatLayout')[0];

		expect(layout.props.currentSource).toBe('Toyota 8FG');
		expect(layout.props.logoUrl).toBe('https://api.example.test/toyota.png');
		expect(layout.props.sourcePanelProps).toBe(hooks.sourcePanelProps);
		expect(mockUseChatApi).toHaveBeenCalledWith(
			expect.objectContaining({
				serverUrl: 'https://api.example.test',
				deviceId: 1,
				playAssistantAudio: expect.any(Function),
			}),
		);
		expect(mockUseMicrophone).toHaveBeenCalledWith(
			expect.objectContaining({
				isLoading: false,
				isSpeechInputUnavailable: false,
				onStopExternal: expect.any(Function),
				onTranscript: expect.any(Function),
			}),
		);
		expect(mockUseWakeWord).toHaveBeenCalledWith({
			enabled: false,
			onDetected: expect.any(Function),
		});
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/devices/1/attachments',
			expect.objectContaining({
				headers: {
					Accept: 'application/json',
					Authorization: 'Bearer test-token',
				},
				signal: expect.any(AbortSignal),
			}),
		);
		expect(findByType(tree, 'ServiceErrorModal')[0].props.visible).toBe(false);
	});

	test('chat screen dismisses stale keyboard state when the app leaves foreground', () => {
		setupChatHooks();
		mockSearchParams = { deviceId: '1', chatSession: 'keyboard-lifecycle' };
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const ChatScreen = require('../app/(tabs)/chat').default;

		collectElements(renderScreen(ChatScreen));
		const reactNative = require('react-native') as {
			AppState: { addEventListener: jest.Mock };
			Keyboard: { dismiss: jest.Mock };
		};
		const appStateListener = reactNative.AppState.addEventListener.mock.calls.find(
			([eventName]) => eventName === 'change',
		)?.[1] as ((state: string) => void) | undefined;

		expect(appStateListener).toBeDefined();
		appStateListener?.('active');
		expect(reactNative.Keyboard.dismiss).not.toHaveBeenCalled();
		appStateListener?.('background');
		expect(reactNative.Keyboard.dismiss).toHaveBeenCalledTimes(1);
	});

	test('chat screen applies only the final Android keyboard frame', () => {
		setupChatHooks();
		mockWindowDimensions = { width: 500, height: 900 };
		mockSearchParams = { deviceId: '1', chatSession: 'android-keyboard-resize' };
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const reactNative = require('react-native') as {
			Platform: { OS: string };
		};
		reactNative.Platform.OS = 'android';
		const ChatScreen = require('../app/(tabs)/chat').default;

		collectElements(renderScreen(ChatScreen));
		const keyboardEvents = (mockKeyboardAddListener.mock.calls as unknown[][]).map(
			([eventName]) => eventName,
		);

		expect(keyboardEvents).toContain('keyboardDidHide');
		expect(keyboardEvents).toContain('keyboardDidShow');
		expect(keyboardEvents).not.toContain('keyboardWillShow');
	});

	test('chat screen uses portrait layout and navigates back to home', () => {
		const hooks = setupChatHooks();
		mockWindowDimensions = { width: 500, height: 900 };
		mockSearchParams = { deviceName: 'Still RX', chatSession: 'abc' };
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const ChatScreen = require('../app/(tabs)/chat').default;

		const tree = renderScreen(ChatScreen);
		const layout = findByType(tree, 'PortraitChatLayout')[0];
		hooks.stopChatApi.mockClear();
		hooks.stopAssistantAudio.mockClear();
		hooks.abortVoiceInput.mockClear();

		layout.props.onBack();

		expect(hooks.stopChatApi).toHaveBeenCalledTimes(1);
		expect(hooks.stopAssistantAudio).toHaveBeenCalledTimes(1);
		expect(hooks.abortVoiceInput).toHaveBeenCalledTimes(1);
		expect(layout.props.insets).toBe(mockSafeAreaInsets);
		expect(mockRouterPush).toHaveBeenCalledWith('/home');
	});

	test('keeps fullscreen schemas in the chat view instead of a native modal', () => {
		setupChatHooks();
		mockWindowDimensions = { width: 500, height: 900 };
		mockSearchParams = { deviceName: 'Still RX', chatSession: 'schema-modal' };
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const ChatScreen = require('../app/(tabs)/chat').default;

		const tree = renderScreen(ChatScreen);

		expect(findByType(tree, 'PortraitChatLayout')).toHaveLength(1);
		expect(findByType(tree, 'Modal').filter((modal) => modal.props.visible)).toHaveLength(0);
	});

	test('history screen requests threads with auth headers', async () => {
		jest.mocked(global.fetch).mockImplementation((url) => {
			const requestUrl = String(url);

			if (requestUrl.endsWith('/api/categories/tree')) {
				return Promise.resolve(
					createJsonResponse([
						{ id: 1, name: 'Toyota', image_url: 'logo.png', children: [] },
					]),
				);
			}
			if (requestUrl.endsWith('/api/devices')) {
				return Promise.resolve(
					createJsonResponse([{ id: 3, category_id: 1, name: 'Toyota 8FG' }]),
				);
			}

			return Promise.resolve(
				createJsonResponse([
					{
						id: 44,
						device_id: 3,
						title: 'Diagnoza wideł',
						created_at: '2026-06-09T08:00:00Z',
						updated_at: '2026-06-09T09:00:00Z',
					},
				]),
			);
		});
		const HistoryScreen = require('../app/(tabs)/history').default;

		const tree = renderScreen(HistoryScreen);
		getTextContent(tree);
		await flushPromises();
		await flushPromises();
		const backButton = findByText(tree, 'WSTECZ');

		expect(mockUseFocusEffect).toHaveBeenCalled();
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/threads',
			expect.objectContaining({
				headers: {
					Accept: 'application/json',
					Authorization: 'Bearer test-token',
				},
				signal: expect.any(AbortSignal),
			}),
		);
		expect(backButton).toBeTruthy();
	});

	test('history screen opens selected thread with vehicle metadata', () => {
		const loadedHistoryState = [
			[
				{
					id: 44,
					device_id: 3,
					title: 'Diagnoza wideł',
					created_at: '2026-06-09T08:00:00Z',
					updated_at: '2026-06-09T09:00:00Z',
				},
			],
			[],
			false,
			null,
			[
				{
					id: 1,
					name: 'Toyota',
					image_url: 'logo.png',
					parent_id: null,
					created_at: '',
					updated_at: '',
					children: [],
				},
			],
			[
				{
					id: 3,
					category_id: 1,
					name: 'Toyota 8FG',
					model_serial_code: '',
					image_url: '',
					created_at: '',
					updated_at: '',
				},
			],
			false,
			false,
		];
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const HistoryScreen = require('../app/(tabs)/history').default;

		mockReactStateValues = [...loadedHistoryState];
		expect(getTextContent(renderScreen(HistoryScreen))).toContain('Toyota 8FG'.toUpperCase());

		mockReactStateValues = [...loadedHistoryState];
		const threadButton = collectTouchableWithText(
			renderScreen(HistoryScreen),
			'Diagnoza wideł',
		)[0];

		threadButton.props.onPress();

		expect(mockRouterPush).toHaveBeenCalledWith({
			pathname: '/chat',
			params: {
				deviceId: '3',
				deviceName: 'Toyota 8FG',
				threadId: '44',
				chatSession: 'history-44',
				logoUrl: 'logo.png',
			},
		});
	});

	test('home screen loads home data and exposes history navigation', () => {
		jest.mocked(global.fetch)
			.mockResolvedValueOnce(createJsonResponse([]))
			.mockResolvedValueOnce(createJsonResponse([]))
			.mockResolvedValueOnce(createJsonResponse([]));
		const HomeScreen = require('../app/(tabs)/home').default;

		const tree = renderScreen(HomeScreen);
		const historyButton = collectTouchableWithText(tree, 'HISTORIA CZATÓW')[0];

		historyButton.props.onPress();

		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/categories/tree',
			expect.objectContaining({
				method: 'GET',
				headers: {
					Authorization: 'Bearer test-token',
					Accept: 'application/json',
				},
			}),
		);
		expect(getTextContent(tree)).toContain('Wybierz Pojazd');
		expect(
			findByType(tree, 'TouchableOpacity').find(
				(element) =>
					element.props.accessibilityLabel === 'Zrób zdjęcie tabliczki znamionowej',
			),
		).toBeDefined();
		expect(getTextContent(tree)).toContain('Ładowanie maszyn...');
		expect(mockUseCameraPermissions).not.toHaveBeenCalled();
		expect(mockRouterPush).toHaveBeenCalledWith('/history');
	});

	test('home screen hides the nameplate camera on web', () => {
		const reactNative = require('react-native') as {
			Platform: { OS: string };
		};
		reactNative.Platform.OS = 'web';
		jest.mocked(global.fetch).mockResolvedValue(createJsonResponse([]));
		const HomeScreen = require('../app/(tabs)/home').default;

		const cameraButtons = findByType(renderScreen(HomeScreen), 'TouchableOpacity').filter(
			(button) => button.props.accessibilityLabel === 'Zrób zdjęcie tabliczki znamionowej',
		);

		expect(cameraButtons).toHaveLength(0);
	});

	test('home screen opens chat with the selected vehicle id', () => {
		const HomeScreen = require('../app/(tabs)/home').default;

		mockReactStateValues = [
			[],
			'',
			null,
			[
				{
					id: 1,
					name: 'Toyota',
					image_url: 'logo.png',
					parent_id: null,
					created_at: '',
					updated_at: '',
					children: [],
				},
			],
			[
				{
					id: 7,
					category_id: 1,
					name: 'Toyota 8FG',
					model_serial_code: '',
					image_url: '',
					created_at: '',
					updated_at: '',
				},
			],
			false,
			false,
		];
		const loadedTree = renderScreen(HomeScreen);
		const vehicleList = findByType(loadedTree, 'FlatList')[0];
		const vehicleCard = vehicleList.props.renderItem({ item: vehicleList.props.data[0] });
		const vehicleButton = findByType(vehicleCard, 'TouchableOpacity')[0];
		const vehicleIcons = findByType(vehicleCard, 'Icon');

		vehicleButton.props.onPress();

		expect(getTextContent(vehicleCard)).toContain('Brak zdjęcia');
		expect(vehicleIcons.some((icon) => icon.props.name === 'forklift')).toBe(true);
		expect(vehicleList.props.extraData).toBe(false);
		expect(mockRouterPush).toHaveBeenCalledWith({
			pathname: '/chat',
			params: expect.objectContaining({
				deviceId: '7',
				deviceName: 'Toyota 8FG',
				logoUrl: 'logo.png',
			}),
		});
	});

	test('home screen shows an empty state when selected filters exclude all vehicles', async () => {
		jest.mocked(global.fetch).mockImplementation((url) => {
			const requestUrl = String(url);

			if (requestUrl.endsWith('/api/categories/tree')) {
				return Promise.resolve(
					createJsonResponse([
						{
							id: 1,
							name: 'Toyota',
							image_url: null,
							children: [{ id: 3, name: 'Wózek', image_url: null, children: [] }],
						},
						{ id: 2, name: 'Still', image_url: null, children: [] },
					]),
				);
			}

			return Promise.resolve(
				createJsonResponse([{ id: 3, category_id: 3, name: 'Toyota 8FG' }]),
			);
		});
		const HomeScreen = require('../app/(tabs)/home').default;

		const tree = renderScreen(HomeScreen);
		getTextContent(tree);
		await flushPromises();
		await flushPromises();
		const loadedTree = renderScreen(HomeScreen);
		const loadedVehicleList = findByType(loadedTree, 'FlatList')[0];
		const stillFilterButton = collectTouchableWithText(
			loadedVehicleList.props.ListHeaderComponent,
			'Still',
		)[0];

		stillFilterButton.props.onPress();
		const filteredTree = renderScreen(HomeScreen);
		const vehicleList = findByType(filteredTree, 'FlatList')[0];

		expect(vehicleList.props.data).toHaveLength(0);
		expect(getTextContent(vehicleList.props.ListEmptyComponent)).toContain(
			'Nie ma pojazdów pasujących do wybranych filtrów.',
		);
	});

	test('home screen does not block the app when device data loading loses connection', async () => {
		jest.mocked(global.fetch).mockRejectedValue(new Error('network down'));
		const HomeScreen = require('../app/(tabs)/home').default;

		findByType(renderScreen(HomeScreen), 'ServiceErrorModal');
		await flushPromises();
		const rerenderedTree = renderScreen(HomeScreen);
		const modal = findByType(rerenderedTree, 'ServiceErrorModal')[0];

		expect(modal.props.visible).toBe(false);
	});

	test('history screen does not block the app for a temporary server failure', async () => {
		jest.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 500 }));
		const HistoryScreen = require('../app/(tabs)/history').default;

		findByType(renderScreen(HistoryScreen), 'ServiceErrorModal');
		await flushPromises();
		const rerenderedTree = renderScreen(HistoryScreen);
		const modal = findByType(rerenderedTree, 'ServiceErrorModal')[0];

		expect(modal.props.visible).toBe(false);
	});

	test('chat screen does not block the app for a temporary thread history failure', async () => {
		setupChatHooks();
		mockSearchParams = {
			deviceId: '3',
			deviceName: 'Toyota 8FG',
			chatSession: 'history-44',
			threadId: '44',
		};
		jest.mocked(global.fetch)
			.mockResolvedValueOnce(createJsonResponse([]))
			.mockResolvedValueOnce(new Response(null, { status: 500 }));
		const ChatScreen = require('../app/(tabs)/chat').default;

		findByType(renderScreen(ChatScreen), 'ServiceErrorModal');
		await flushPromises();
		const rerenderedTree = renderScreen(ChatScreen);
		const modal = findByType(rerenderedTree, 'ServiceErrorModal')[0];

		expect(modal.props.visible).toBe(false);
	});
});

const collectTouchableWithText = (tree: unknown, text: string) =>
	findByType(tree, 'TouchableOpacity').filter((element) =>
		getTextContent(element).includes(text),
	);
