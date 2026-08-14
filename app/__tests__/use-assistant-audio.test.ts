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

jest.mock('@/utils/api-config', () => ({
	API_URL: 'https://api.example.test',
	API_URL_CONFIG_ERROR: null,
}));

import { AUTH_SERVICE_FEATURE } from '@/utils/auth-errors';
import { Platform } from 'react-native';
import { useAssistantAudio } from '../hooks/use-assistant-audio';

const originalAuthToken = process.env.EXPO_PUBLIC_AUTH_TOKEN;

const createHarness = (
	ttsVoice: 'Algenib' | 'Leda' = 'Algenib',
	ttsStyle: 'neutral' | 'warm' | 'sensual' | 'extra_sensual' | 'extreme_sensual' = 'neutral',
) => {
	mockReactStateValues = [];
	mockReactStateIndex = 0;

	const setIsLoading = jest.fn();
	const setIsGenerating = jest.fn();
	const onServiceError = jest.fn();
	const api = useAssistantAudio({
		setIsLoading,
		setIsGenerating,
		ttsVoice,
		ttsStyle,
		onServiceError,
	});

	return {
		api,
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
		process.env.EXPO_PUBLIC_AUTH_TOKEN = 'test-token';
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		if (originalAuthToken === undefined) {
			delete process.env.EXPO_PUBLIC_AUTH_TOKEN;
		} else {
			process.env.EXPO_PUBLIC_AUTH_TOKEN = originalAuthToken;
		}
		jest.restoreAllMocks();
	});

	test('requests server TTS audio, writes it as base64 on native, and starts playback', async () => {
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('wav-data', {
				status: 200,
				headers: { 'content-type': 'audio/wav' },
			}),
		);
		const harness = createHarness('Leda', 'extreme_sensual');

		await harness.api.playAssistantAudio('Dzień dobry');

		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/tts',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Accept: 'audio/wav',
					Authorization: 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					text: 'Dzień dobry',
					voice: 'Leda',
					style: 'extreme_sensual',
				}),
			}),
		);
		expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
			'file:///documents/assistant_response.wav',
			'd2F2LWRhdGE=',
			{ encoding: 'base64' },
		);
		expect(mockAudioPlayer.replace).toHaveBeenCalledWith(
			'file:///documents/assistant_response.wav',
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

		resolveFetch(new Response('wav-data', { status: 200 }));
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
			new Response('wav-data', {
				status: 200,
				headers: { 'content-type': 'audio/wav' },
			}),
		);
		const harness = createHarness();

		await harness.api.playAssistantAudio('Web audio');

		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
		expect(mockAudioPlayer.replace).toHaveBeenCalledWith(objectUrl);
		expect(mockAudioPlayer.play).toHaveBeenCalled();
	});

	test('requests server TTS audio as wav on Android', async () => {
		Platform.OS = 'android';
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('wav-data', {
				status: 200,
				headers: { 'content-type': 'audio/wav' },
			}),
		);
		const harness = createHarness();

		await harness.api.playAssistantAudio('Android audio');

		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/tts',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Accept: 'audio/wav',
					Authorization: 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ text: 'Android audio', voice: 'Algenib', style: 'neutral' }),
			}),
		);
		expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
			'file:///documents/assistant_response.wav',
			'd2F2LWRhdGE=',
			{ encoding: 'base64' },
		);
		expect(mockAudioPlayer.replace).toHaveBeenCalledWith(
			'file:///documents/assistant_response.wav',
		);
		expect(mockAudioPlayer.play).toHaveBeenCalled();
		expect(harness.setIsGenerating).toHaveBeenCalledWith(false);
	});

	test('reports missing auth token through the service error callback', async () => {
		delete process.env.EXPO_PUBLIC_AUTH_TOKEN;
		const harness = createHarness();

		await harness.api.playAssistantAudio('No token');

		expect(global.fetch).not.toHaveBeenCalled();
		expect(harness.onServiceError).toHaveBeenCalledWith(
			AUTH_SERVICE_FEATURE,
			expect.objectContaining({
				message: 'Missing AUTH_TOKEN',
			}),
		);
		expect(harness.setIsLoading).toHaveBeenLastCalledWith(false);
		expect(harness.setIsGenerating).toHaveBeenCalledWith(false);
		expect(harness.state.isAudioPlaying).toBe(false);
	});

	test('treats 401 and 403 responses as auth service errors', async () => {
		jest.mocked(global.fetch).mockResolvedValue(new Response(null, { status: 401 }));
		const harness = createHarness();

		await harness.api.playAssistantAudio('Bad token');

		expect(harness.onServiceError).toHaveBeenCalledWith(
			AUTH_SERVICE_FEATURE,
			expect.objectContaining({
				message: 'Invalid AUTH_TOKEN: 401',
			}),
		);
		expect(mockAudioPlayer.play).not.toHaveBeenCalled();
	});

	test('reports non-auth TTS failures as assistant audio service errors', async () => {
		jest.mocked(global.fetch).mockResolvedValue(
			new Response(JSON.stringify({ detail: 'Gemini TTS error 400: bad model' }), {
				status: 502,
				headers: { 'content-type': 'application/json' },
			}),
		);
		const harness = createHarness();

		await harness.api.playAssistantAudio('Server error');

		expect(harness.onServiceError).toHaveBeenCalledWith(
			'odtwarzanie odpowiedzi głosowej',
			expect.objectContaining({
				message: 'Gemini TTS error 400: bad model',
			}),
		);
		expect(mockAudioPlayer.play).not.toHaveBeenCalled();
		expect(harness.state.isAudioPlaying).toBe(false);
	});

	test('pauses current playback only once when stopped repeatedly', async () => {
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('wav-data', {
				status: 200,
				headers: { 'content-type': 'audio/wav' },
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
