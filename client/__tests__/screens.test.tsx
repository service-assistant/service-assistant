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
const mockUseFocusEffect = jest.fn((callback: () => void | (() => void)) => callback());
const mockUseCameraPermissions = jest.fn(() => [{ granted: true }, jest.fn()]);
const mockImpactAsync = jest.fn(() => Promise.resolve());
const mockSelectionAsync = jest.fn(() => Promise.resolve());
const mockOrientationLockAsync = jest.fn(() => Promise.resolve());
const mockOrientationUnlockAsync = jest.fn(() => Promise.resolve());
const mockImageGetSize = jest.fn();
const mockKeyboardAddListener = jest.fn(() => ({ remove: jest.fn() }));
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
		Keyboard: { addListener: mockKeyboardAddListener },
		Platform: {
			OS: 'ios',
			select: (options: Record<string, unknown>) => options.ios ?? options.default,
		},
		ScrollView: createHost('ScrollView'),
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

jest.mock('expo-blur', () => {
	const React = require('react');
	return {
		BlurView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('BlurView', props, children),
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

jest.mock('@/components/ChatLayouts', () => {
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

jest.mock('@/components/ServiceErrorModal', () => {
	const React = require('react');
	return function MockServiceErrorModal({ children, ...props }: Record<string, unknown>) {
		return React.createElement('ServiceErrorModal', props, children);
	};
});

jest.mock('@/components/haptic-tab', () => ({
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

jest.mock('@/utils/api-config', () => ({
	AUTH_URL: 'https://api.example.test',
	AUTH_URL_CONFIG_ERROR: null,
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
		mockKeyboardAddListener.mockClear();
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
		process.env.EXPO_PUBLIC_AUTH_TOKEN = 'test-token';
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
		delete process.env.EXPO_PUBLIC_AUTH_TOKEN;
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
			tabBarStyle: { display: 'none' },
		});
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
		expect(findByType(tree, 'ServiceErrorModal')[0].props.visible).toBe(false);
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

	test('history screen requests threads with auth headers', async () => {
		jest.mocked(global.fetch).mockImplementation((url) => {
			const requestUrl = String(url);

			if (requestUrl.endsWith('/api/brands')) {
				return Promise.resolve(
					createJsonResponse([{ id: 1, name: 'Toyota', logo_url: 'logo.png' }]),
				);
			}
			if (requestUrl.endsWith('/api/device_types')) {
				return Promise.resolve(createJsonResponse([{ id: 2, name: 'Wózek' }]));
			}
			if (requestUrl.endsWith('/api/devices')) {
				return Promise.resolve(
					createJsonResponse([
						{ id: 3, brand_id: 1, device_type_id: 2, name: 'Toyota 8FG' },
					]),
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
			'WSZYSTKIE',
			'WSZYSTKIE',
			false,
			null,
			[{ id: 1, name: 'Toyota', logo_url: 'logo.png', created_at: '', updated_at: '' }],
			[{ id: 2, name: 'Wózek', created_at: '', updated_at: '' }],
			[
				{
					id: 3,
					brand_id: 1,
					device_type_id: 2,
					name: 'Toyota 8FG',
					model_serial_code: '',
					image_url: '',
					created_at: '',
					updated_at: '',
				},
			],
			false,
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
			'https://api.example.test/api/brands',
			expect.objectContaining({
				method: 'GET',
				headers: {
					Authorization: 'Bearer test-token',
					Accept: 'application/json',
				},
			}),
		);
		expect(getTextContent(tree)).toContain('Wybierz Pojazd');
		expect(mockUseCameraPermissions).not.toHaveBeenCalled();
		expect(mockRouterPush).toHaveBeenCalledWith('/history');
	});

	test('home screen shows an empty state when selected filters exclude all vehicles', async () => {
		jest.mocked(global.fetch).mockImplementation((url) => {
			const requestUrl = String(url);

			if (requestUrl.endsWith('/api/brands')) {
				return Promise.resolve(
					createJsonResponse([
						{ id: 1, name: 'Toyota', logo_url: null },
						{ id: 2, name: 'Still', logo_url: null },
					]),
				);
			}
			if (requestUrl.endsWith('/api/device_types')) {
				return Promise.resolve(createJsonResponse([{ id: 2, name: 'Wózek' }]));
			}

			return Promise.resolve(
				createJsonResponse([{ id: 3, brand_id: 1, device_type_id: 2, name: 'Toyota 8FG' }]),
			);
		});
		const HomeScreen = require('../app/(tabs)/home').default;

		const tree = renderScreen(HomeScreen);
		getTextContent(tree);
		await flushPromises();
		await flushPromises();
		const loadedTree = renderScreen(HomeScreen);
		const stillFilterButton = collectTouchableWithText(loadedTree, 'STILL')[0];

		stillFilterButton.props.onPress();
		const filteredTree = renderScreen(HomeScreen);
		const vehicleList = findByType(filteredTree, 'Animated.FlatList')[0];

		expect(vehicleList.props.data).toHaveLength(0);
		expect(getTextContent(vehicleList.props.ListEmptyComponent)).toContain(
			'Nie ma pojazdów pasujących do wybranych filtrów.',
		);
	});

	test('home screen shows a service error modal when device data loading fails', async () => {
		jest.mocked(global.fetch).mockRejectedValue(new Error('network down'));
		const HomeScreen = require('../app/(tabs)/home').default;

		findByType(renderScreen(HomeScreen), 'ServiceErrorModal');
		await flushPromises();
		const rerenderedTree = renderScreen(HomeScreen);
		const modal = findByType(rerenderedTree, 'ServiceErrorModal')[0];

		expect(modal.props.visible).toBe(true);
		expect(modal.props.featureName).toBe('lista maszyn');
	});

	test('history screen shows a service error modal when history loading fails', async () => {
		jest.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 500 }));
		const HistoryScreen = require('../app/(tabs)/history').default;

		findByType(renderScreen(HistoryScreen), 'ServiceErrorModal');
		await flushPromises();
		const rerenderedTree = renderScreen(HistoryScreen);
		const modal = findByType(rerenderedTree, 'ServiceErrorModal')[0];

		expect(modal.props.visible).toBe(true);
		expect(modal.props.featureName).toBe('historia czatów');
	});

	test('chat screen shows a service error modal when thread history loading fails', async () => {
		setupChatHooks();
		mockSearchParams = {
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

		expect(modal.props.visible).toBe(true);
		expect(modal.props.featureName).toBe('historia wątku');
	});
});

const collectTouchableWithText = (tree: unknown, text: string) =>
	findByType(tree, 'TouchableOpacity').filter((element) =>
		getTextContent(element).includes(text),
	);
