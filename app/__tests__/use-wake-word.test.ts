const mockPlatform = { OS: 'android' };
const mockRequestRecordingPermissionsAsync = jest.fn();
const mockStartWakeWordDetection = jest.fn();
const mockStopWakeWordDetection = jest.fn();
const mockAddWakeWordListener = jest.fn();
const mockAddWakeWordErrorListener = jest.fn();
const mockRemoveWakeWordListener = jest.fn();
const mockRemoveWakeWordErrorListener = jest.fn();
let mockIsWakeWordAvailable = true;
let lastCleanup: void | (() => void);

jest.mock('react', () => ({
	useEffect: (callback: () => void | (() => void)) => {
		lastCleanup = callback();
	},
}));

jest.mock('react-native', () => ({
	Platform: mockPlatform,
}));

jest.mock('expo-audio', () => ({
	AudioModule: {
		requestRecordingPermissionsAsync: mockRequestRecordingPermissionsAsync,
	},
}));

jest.mock('@/modules/wake-word', () => ({
	addWakeWordErrorListener: mockAddWakeWordErrorListener,
	addWakeWordListener: mockAddWakeWordListener,
	get isWakeWordAvailable() {
		return mockIsWakeWordAvailable;
	},
	startWakeWordDetection: mockStartWakeWordDetection,
	stopWakeWordDetection: mockStopWakeWordDetection,
}));

import { Platform } from 'react-native';
import { useWakeWord } from '../hooks/use-wake-word';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useWakeWord', () => {
	beforeEach(() => {
		Platform.OS = 'android';
		mockIsWakeWordAvailable = true;
		lastCleanup = undefined;
		mockRequestRecordingPermissionsAsync.mockReset();
		mockStartWakeWordDetection.mockReset();
		mockStopWakeWordDetection.mockReset();
		mockAddWakeWordListener.mockReset();
		mockAddWakeWordErrorListener.mockReset();
		mockRemoveWakeWordListener.mockReset();
		mockRemoveWakeWordErrorListener.mockReset();
		mockRequestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
		mockStartWakeWordDetection.mockResolvedValue(undefined);
		mockStopWakeWordDetection.mockResolvedValue(undefined);
		mockAddWakeWordListener.mockReturnValue({ remove: mockRemoveWakeWordListener });
		mockAddWakeWordErrorListener.mockReturnValue({ remove: mockRemoveWakeWordErrorListener });
		jest.spyOn(console, 'log').mockImplementation(() => undefined);
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('requests permission and starts detection on android when enabled', async () => {
		useWakeWord({ enabled: true, onDetected: jest.fn() });
		await flushPromises();

		expect(mockAddWakeWordListener).toHaveBeenCalledWith(expect.any(Function));
		expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalled();
		expect(mockStartWakeWordDetection).toHaveBeenCalled();
		expect(mockStopWakeWordDetection).not.toHaveBeenCalled();
	});

	test('stops detection when disabled', async () => {
		useWakeWord({ enabled: false, onDetected: jest.fn() });
		await flushPromises();

		expect(mockStopWakeWordDetection).toHaveBeenCalled();
		expect(mockAddWakeWordListener).not.toHaveBeenCalled();
		expect(mockRequestRecordingPermissionsAsync).not.toHaveBeenCalled();
		expect(mockStartWakeWordDetection).not.toHaveBeenCalled();
	});

	test('stops detection on non-android platforms', async () => {
		Platform.OS = 'ios';

		useWakeWord({ enabled: true, onDetected: jest.fn() });
		await flushPromises();

		expect(mockStopWakeWordDetection).toHaveBeenCalled();
		expect(mockAddWakeWordListener).not.toHaveBeenCalled();
		expect(mockStartWakeWordDetection).not.toHaveBeenCalled();
	});

	test('does not start detection when native module is unavailable', async () => {
		mockIsWakeWordAvailable = false;

		useWakeWord({ enabled: true, onDetected: jest.fn() });
		await flushPromises();

		expect(mockStopWakeWordDetection).toHaveBeenCalled();
		expect(mockAddWakeWordListener).not.toHaveBeenCalled();
		expect(mockStartWakeWordDetection).not.toHaveBeenCalled();
	});

	test('does not start detection when recording permission is denied', async () => {
		mockRequestRecordingPermissionsAsync.mockResolvedValue({ granted: false });

		useWakeWord({ enabled: true, onDetected: jest.fn() });
		await flushPromises();

		expect(mockAddWakeWordListener).toHaveBeenCalled();
		expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalled();
		expect(mockStartWakeWordDetection).not.toHaveBeenCalled();
	});

	test('stops detection before calling the detection callback', async () => {
		const onDetected = jest.fn();
		useWakeWord({ enabled: true, onDetected });

		const listener = mockAddWakeWordListener.mock.calls[0][0] as (event: {
			probability: number;
		}) => void;
		listener({ probability: 0.93 });
		await flushPromises();

		expect(mockStopWakeWordDetection).toHaveBeenCalled();
		expect(onDetected).toHaveBeenCalled();
	});

	test('removes listener and stops detection on cleanup', async () => {
		useWakeWord({ enabled: true, onDetected: jest.fn() });

		lastCleanup?.();
		await flushPromises();

		expect(mockRemoveWakeWordListener).toHaveBeenCalled();
		expect(mockRemoveWakeWordErrorListener).toHaveBeenCalled();
		expect(mockStopWakeWordDetection).toHaveBeenCalled();
	});

	test('stops detection if startup finishes after cleanup', async () => {
		let resolvePermission!: (value: { granted: boolean }) => void;
		mockRequestRecordingPermissionsAsync.mockReturnValue(
			new Promise((resolve) => {
				resolvePermission = resolve;
			}),
		);

		useWakeWord({ enabled: true, onDetected: jest.fn() });
		lastCleanup?.();
		resolvePermission({ granted: true });
		await flushPromises();
		await flushPromises();

		expect(mockStartWakeWordDetection).not.toHaveBeenCalled();
		expect(mockStopWakeWordDetection).toHaveBeenCalled();
	});
});
