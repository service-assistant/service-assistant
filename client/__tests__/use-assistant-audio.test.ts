let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;
const mockPlatform = { OS: 'ios' };
const mockAudioPlayer = {
	playing: false,
	pause: jest.fn(),
	play: jest.fn(),
	replace: jest.fn(),
};
const mockUseAudioPlayer = jest.fn(() => mockAudioPlayer);
const mockWriteAsStringAsync = jest.fn();

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
	Platform: mockPlatform,
}));

jest.mock('expo-audio', () => ({
	useAudioPlayer: mockUseAudioPlayer,
}));

jest.mock('expo-file-system/legacy', () => ({
	documentDirectory: 'file:///documents/',
	EncodingType: {
		Base64: 'base64',
	},
	writeAsStringAsync: mockWriteAsStringAsync,
}));

import { Platform } from 'react-native';
import { useAssistantAudio } from '../hooks/use-assistant-audio';

const originalOpenAiApiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

const createHarness = () => {
	mockReactStateValues = [];
	mockReactStateIndex = 0;

	const setIsLoading = jest.fn();
	const setIsGenerating = jest.fn();
	const onServiceError = jest.fn();
	const onOpenAiKeyError = jest.fn();
	const api = useAssistantAudio({
		setIsLoading,
		setIsGenerating,
		onServiceError,
		onOpenAiKeyError,
	});

	return {
		api,
		onOpenAiKeyError,
		onServiceError,
		setIsGenerating,
		setIsLoading,
		get state() {
			return {
				isAudioPlaying: mockReactStateValues[0],
			};
		},
	};
};

describe('useAssistantAudio', () => {
	beforeEach(() => {
		Platform.OS = 'ios';
		mockAudioPlayer.playing = false;
		mockAudioPlayer.pause.mockReset();
		mockAudioPlayer.play.mockReset();
		mockAudioPlayer.replace.mockReset();
		mockUseAudioPlayer.mockClear();
		mockWriteAsStringAsync.mockReset();
		process.env.EXPO_PUBLIC_OPENAI_API_KEY = ' openai-test-key ';
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		if (originalOpenAiApiKey === undefined) {
			delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;
		} else {
			process.env.EXPO_PUBLIC_OPENAI_API_KEY = originalOpenAiApiKey;
		}
		jest.restoreAllMocks();
	});

	test('requests TTS audio, writes it as base64 on native, and starts playback', async () => {
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('mp3-data', {
				status: 200,
				headers: { 'content-type': 'audio/mpeg' },
			}),
		);
		const harness = createHarness();

		await harness.api.playAssistantAudio('Dzień dobry');

		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.openai.com/v1/audio/speech',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Authorization: 'Bearer openai-test-key',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'tts-1',
					input: 'Dzień dobry',
					voice: 'alloy',
				}),
			}),
		);
		expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
			'file:///documents/chatgpt_response.mp3',
			'bXAzLWRhdGE=',
			{ encoding: 'base64' },
		);
		expect(mockAudioPlayer.replace).toHaveBeenCalledWith(
			'file:///documents/chatgpt_response.mp3',
		);
		expect(mockAudioPlayer.play).toHaveBeenCalled();
		expect(harness.state.isAudioPlaying).toBe(true);
		expect(harness.setIsLoading).toHaveBeenNthCalledWith(1, true);
		expect(harness.setIsLoading).toHaveBeenLastCalledWith(false);
		expect(harness.setIsGenerating).toHaveBeenCalledWith(false);
	});

	test('keeps audio activity active while handing generation off to playback', async () => {
		let resolveFetch!: (response: Response) => void;
		jest.mocked(global.fetch).mockReturnValue(
			new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			}),
		);
		const harness = createHarness();

		const playPromise = harness.api.playAssistantAudio('Bez skoku stanu');
		await Promise.resolve();

		expect(harness.state.isAudioPlaying).toBe(true);

		resolveFetch(new Response('mp3-data', { status: 200 }));
		await playPromise;

		expect(harness.state.isAudioPlaying).toBe(true);
	});

	test('plays TTS audio from an object URL on web', async () => {
		Platform.OS = 'web';
		const objectUrl = 'blob:tts-audio';
		const createObjectURL = jest.fn(() => objectUrl);
		Object.defineProperty(global.URL, 'createObjectURL', {
			value: createObjectURL,
			configurable: true,
		});
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('mp3-data', {
				status: 200,
				headers: { 'content-type': 'audio/mpeg' },
			}),
		);
		const harness = createHarness();

		await harness.api.playAssistantAudio('Web audio');

		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
		expect(mockAudioPlayer.replace).toHaveBeenCalledWith(objectUrl);
		expect(mockAudioPlayer.play).toHaveBeenCalled();
	});

	test('reports missing OpenAI API keys through the key error callback', async () => {
		delete process.env.EXPO_PUBLIC_OPENAI_API_KEY;
		const harness = createHarness();

		await harness.api.playAssistantAudio('No key');

		expect(global.fetch).not.toHaveBeenCalled();
		expect(harness.onOpenAiKeyError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Missing EXPO_PUBLIC_OPENAI_API_KEY',
				isOpenAiKeyError: true,
			}),
		);
		expect(harness.onServiceError).not.toHaveBeenCalled();
		expect(harness.setIsLoading).toHaveBeenLastCalledWith(false);
		expect(harness.setIsGenerating).toHaveBeenCalledWith(false);
		expect(harness.state.isAudioPlaying).toBe(false);
	});

	test('treats 401 and 403 responses as OpenAI key errors', async () => {
		jest.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 401 }));
		const harness = createHarness();

		await harness.api.playAssistantAudio('Bad key');

		expect(harness.onOpenAiKeyError).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'OpenAI API error: 401',
				isOpenAiKeyError: true,
			}),
		);
		expect(harness.onServiceError).not.toHaveBeenCalled();
		expect(mockAudioPlayer.play).not.toHaveBeenCalled();
	});

	test('reports non-auth TTS failures as assistant audio service errors', async () => {
		jest.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 500 }));
		const harness = createHarness();

		await harness.api.playAssistantAudio('Server error');

		expect(harness.onServiceError).toHaveBeenCalledWith(
			'odtwarzanie odpowiedzi głosowej',
			expect.objectContaining({
				message: 'OpenAI API error: 500',
				isOpenAiKeyError: false,
			}),
		);
		expect(harness.onOpenAiKeyError).not.toHaveBeenCalled();
		expect(mockAudioPlayer.play).not.toHaveBeenCalled();
		expect(harness.state.isAudioPlaying).toBe(false);
	});

	test('pauses current playback only once when stopped repeatedly', async () => {
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('mp3-data', {
				status: 200,
				headers: { 'content-type': 'audio/mpeg' },
			}),
		);
		const harness = createHarness();
		await harness.api.playAssistantAudio('Stop audio');

		harness.api.stopAssistantAudio();
		harness.api.stopAssistantAudio();

		expect(mockAudioPlayer.pause).toHaveBeenCalledTimes(1);
		expect(harness.state.isAudioPlaying).toBe(false);
	});

	test('ignores a stop race after Expo has already released the player', () => {
		mockAudioPlayer.playing = true;
		mockAudioPlayer.pause.mockImplementation(() => {
			throw new Error('Cannot use shared object that was already released');
		});
		const harness = createHarness();

		expect(() => harness.api.stopAssistantAudio()).not.toThrow();
		expect(console.log).not.toHaveBeenCalledWith(
			'Handled TTS player stop error:',
			expect.anything(),
		);
		expect(harness.state.isAudioPlaying).toBe(false);
	});
});
