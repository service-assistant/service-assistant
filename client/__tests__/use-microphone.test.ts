type VoiceMessage = {
	id: number;
	sender: 'user' | 'ai';
	text: string;
	isSpeaking?: boolean;
};

let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;
const mockAnimatedValueSetValue = jest.fn();
const mockAnimatedTimingStart = jest.fn();
const mockRequestRecordingPermissionsAsync = jest.fn();
const mockSetAudioModeAsync = jest.fn();
const mockRecorder = {
	isRecording: false,
	uri: 'file:///recording.m4a',
	getStatus: jest.fn(() => ({ isRecording: false, metering: -80 })),
	prepareToRecordAsync: jest.fn(),
	record: jest.fn(() => {
		mockRecorder.isRecording = true;
	}),
	stop: jest.fn(() => {
		mockRecorder.isRecording = false;
	}),
};
const mockUseAudioRecorder = jest.fn(() => mockRecorder);
const mockUseWakeWord = jest.fn();

jest.mock('react', () => ({
	useCallback: (callback: unknown) => callback,
	useEffect: () => undefined,
	useRef: (initialValue: unknown) => ({ current: initialValue }),
	useState: (initialValue: unknown) => {
		const stateIndex = mockReactStateIndex;
		mockReactStateIndex += 1;

		if (mockReactStateValues.length <= stateIndex) {
			mockReactStateValues[stateIndex] =
				typeof initialValue === 'function' ? initialValue() : initialValue;
		}

		const setState = (value: unknown) => {
			mockReactStateValues[stateIndex] =
				typeof value === 'function' ? value(mockReactStateValues[stateIndex]) : value;
		};

		return [mockReactStateValues[stateIndex], setState];
	},
}));

jest.mock('react-native', () => ({
	Animated: {
		Value: jest.fn(() => ({ setValue: mockAnimatedValueSetValue })),
		timing: jest.fn(() => ({ start: mockAnimatedTimingStart })),
	},
}));

jest.mock('expo-audio', () => ({
	AudioModule: {
		requestRecordingPermissionsAsync: mockRequestRecordingPermissionsAsync,
		setAudioModeAsync: mockSetAudioModeAsync,
	},
	RecordingPresets: {
		HIGH_QUALITY: { preset: 'high-quality' },
	},
	useAudioRecorder: mockUseAudioRecorder,
}));

jest.mock('@/hooks/use-wake-word', () => ({
	useWakeWord: mockUseWakeWord,
}));

import { useMicrophone } from '../hooks/use-microphone';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const createBlobResponse = () =>
	new Response('audio-data', {
		status: 200,
		headers: { 'content-type': 'audio/m4a' },
	});

const createDeepgramResponse = (transcript: string, status = 200) =>
	new Response(
		JSON.stringify({
			results: {
				channels: [
					{
						alternatives: [{ transcript }],
					},
				],
			},
		}),
		{
			status,
			headers: { 'content-type': 'application/json' },
		},
	);

const createHarness = (
	params: {
		messages?: VoiceMessage[];
		isLoading?: boolean;
		isGenerating?: boolean;
		isAudioPlaying?: boolean;
		showTextInput?: boolean;
		isSpeechInputUnavailable?: boolean;
	} = {},
) => {
	mockReactStateValues = [];
	mockReactStateIndex = 0;
	let messages = params.messages ?? [];
	let showTextInput = params.showTextInput ?? false;
	let isLoading = params.isLoading ?? false;

	const setMessages = jest.fn(
		(value: VoiceMessage[] | ((prev: VoiceMessage[]) => VoiceMessage[])) => {
			messages = typeof value === 'function' ? value(messages) : value;
		},
	);
	const setShowTextInput = jest.fn((value: boolean | ((prev: boolean) => boolean)) => {
		showTextInput = typeof value === 'function' ? value(showTextInput) : value;
	});
	const setIsLoading = jest.fn((value: boolean | ((prev: boolean) => boolean)) => {
		isLoading = typeof value === 'function' ? value(isLoading) : value;
	});
	const onStopExternal = jest.fn();
	const onTranscript = jest.fn();
	const onServiceError = jest.fn();
	const onSpeechInputError = jest.fn();

	const api = useMicrophone({
		messages,
		setMessages,
		isLoading,
		isGenerating: params.isGenerating ?? false,
		isAudioPlaying: params.isAudioPlaying ?? false,
		showTextInput,
		isSpeechInputUnavailable: params.isSpeechInputUnavailable ?? false,
		setShowTextInput,
		setIsLoading,
		onStopExternal,
		onTranscript,
		onServiceError,
		onSpeechInputError,
	});

	return {
		api,
		onServiceError,
		onSpeechInputError,
		onStopExternal,
		onTranscript,
		setIsLoading,
		setMessages,
		setShowTextInput,
		get state() {
			return {
				isListening: mockReactStateValues[0],
				isTranscribing: mockReactStateValues[1],
				isMicRestartBlocked: mockReactStateValues[2],
				isLoading,
				messages,
				showTextInput,
			};
		},
	};
};

describe('useMicrophone', () => {
	const originalDeepgramApiKey = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY;

	beforeEach(() => {
		jest.useRealTimers();
		mockRecorder.isRecording = false;
		mockRecorder.uri = 'file:///recording.m4a';
		mockRecorder.getStatus.mockClear();
		mockRecorder.prepareToRecordAsync.mockReset();
		mockRecorder.record.mockClear();
		mockRecorder.stop.mockReset();
		mockRecorder.stop.mockImplementation(() => {
			mockRecorder.isRecording = false;
		});
		mockUseAudioRecorder.mockClear();
		mockUseWakeWord.mockClear();
		mockRequestRecordingPermissionsAsync.mockReset();
		mockSetAudioModeAsync.mockReset();
		mockAnimatedValueSetValue.mockClear();
		mockAnimatedTimingStart.mockClear();
		mockRequestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
		mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
		process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY = 'deepgram-test-key';
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
		jest.spyOn(Date, 'now').mockReturnValue(1000);
	});

	afterEach(() => {
		if (originalDeepgramApiKey === undefined) {
			delete process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY;
		} else {
			process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY = originalDeepgramApiKey;
		}
		jest.restoreAllMocks();
		jest.useRealTimers();
	});

	test('reports Deepgram configuration errors before requesting permissions', async () => {
		delete process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY;
		const harness = createHarness();

		await harness.api.handleMicPress();

		expect(mockRequestRecordingPermissionsAsync).not.toHaveBeenCalled();
		expect(harness.onSpeechInputError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'Missing EXPO_PUBLIC_DEEPGRAM_API_KEY' }),
		);
		expect(harness.onServiceError).toHaveBeenCalledWith(
			'rozpoznawanie mowy',
			expect.objectContaining({ message: 'Missing EXPO_PUBLIC_DEEPGRAM_API_KEY' }),
		);
		expect(harness.state.isListening).toBe(false);
		expect(harness.setIsLoading).toHaveBeenCalledWith(false);
	});

	test('starts recording and adds a speaking user placeholder when permission is granted', async () => {
		const harness = createHarness({ showTextInput: true });

		await harness.api.handleMicPress();

		expect(harness.setShowTextInput).toHaveBeenCalledWith(false);
		expect(harness.onStopExternal).toHaveBeenCalled();
		expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalled();
		expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();
		expect(mockRecorder.record).toHaveBeenCalled();
		expect(mockAnimatedValueSetValue).toHaveBeenCalledWith(0.2);
		expect(harness.state.messages).toEqual([
			{ id: 1000, sender: 'user', text: '', isSpeaking: true },
		]);
		expect(harness.state.isListening).toBe(true);

		harness.api.abortVoiceInput();
		await flushPromises();
	});

	test('removes the placeholder when recording permission is denied', async () => {
		mockRequestRecordingPermissionsAsync.mockResolvedValue({ granted: false });
		const harness = createHarness();

		await harness.api.handleMicPress();

		expect(mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
		expect(mockRecorder.record).not.toHaveBeenCalled();
		expect(harness.state.messages).toEqual([]);
		expect(harness.state.isListening).toBe(false);
	});

	test('stops an active recording, sends it to Deepgram, and applies the transcript', async () => {
		const harness = createHarness();
		await harness.api.handleMicPress();

		jest.useFakeTimers({ doNotFake: ['Date'] });
		(Date.now as jest.Mock).mockReturnValue(2000);
		jest.mocked(global.fetch)
			.mockResolvedValueOnce(createBlobResponse())
			.mockResolvedValueOnce(createDeepgramResponse('podnieś widły'));

		const stopPromise = harness.api.handleMicPress();
		await Promise.resolve();
		await jest.advanceTimersByTimeAsync(500);
		await stopPromise;
		await Promise.resolve();
		await Promise.resolve();

		expect(mockRecorder.stop).toHaveBeenCalled();
		expect(global.fetch).toHaveBeenNthCalledWith(
			1,
			'file:///recording.m4a',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(global.fetch).toHaveBeenNthCalledWith(
			2,
			'https://api.deepgram.com/v1/listen?model=nova-3&numerals=true&language=pl&smart_format=true',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Authorization: 'Token deepgram-test-key',
					'Content-Type': 'audio/m4a',
				},
				body: expect.any(Blob),
			}),
		);
		expect(harness.state.messages).toEqual([
			{ id: 1000, sender: 'user', text: 'podnieś widły', isSpeaking: false },
		]);
		expect(harness.onTranscript).toHaveBeenCalledWith('podnieś widły');
		expect(harness.state.isTranscribing).toBe(false);
	});

	test('removes the speaking placeholder when Deepgram returns an empty transcript', async () => {
		const harness = createHarness();
		await harness.api.handleMicPress();

		jest.useFakeTimers({ doNotFake: ['Date'] });
		(Date.now as jest.Mock).mockReturnValue(2000);
		jest.mocked(global.fetch)
			.mockResolvedValueOnce(createBlobResponse())
			.mockResolvedValueOnce(createDeepgramResponse('   '));

		const stopPromise = harness.api.handleMicPress();
		await Promise.resolve();
		await jest.advanceTimersByTimeAsync(500);
		await stopPromise;
		await Promise.resolve();
		await Promise.resolve();

		expect(harness.state.messages).toEqual([]);
		expect(harness.onTranscript).not.toHaveBeenCalled();
		expect(harness.setIsLoading).toHaveBeenLastCalledWith(false);
		expect(harness.state.isTranscribing).toBe(false);
	});

	test('abortVoiceInput stops recording and removes pending voice messages', async () => {
		const harness = createHarness({
			messages: [
				{ id: 1, sender: 'user', text: '', isSpeaking: true },
				{ id: 2, sender: 'ai', text: 'answer' },
			],
		});
		mockRecorder.isRecording = true;

		harness.api.abortVoiceInput();
		await flushPromises();

		expect(mockRecorder.stop).toHaveBeenCalled();
		expect(harness.state.messages).toEqual([{ id: 2, sender: 'ai', text: 'answer' }]);
		expect(harness.state.isListening).toBe(false);
		expect(harness.state.isTranscribing).toBe(false);
	});

	test('configures wake-word only when voice input is idle and available', () => {
		createHarness({ isSpeechInputUnavailable: false });

		expect(mockUseWakeWord).toHaveBeenCalledWith({
			enabled: true,
			onDetected: expect.any(Function),
		});

		mockUseWakeWord.mockClear();
		createHarness({ isLoading: true });

		expect(mockUseWakeWord).toHaveBeenCalledWith({
			enabled: false,
			onDetected: expect.any(Function),
		});
	});
});
