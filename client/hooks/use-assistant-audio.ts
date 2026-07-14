import { Buffer } from 'buffer';
import { useAudioPlayer } from 'expo-audio';
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from 'react';
import { Platform } from 'react-native';

import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';
import * as FileSystem from 'expo-file-system/legacy';

const PLAYBACK_START_GRACE_MS = 1000;
const VOICE_OUTPUT_FEATURE = 'odtwarzanie odpowiedzi głosowej';
const MAX_ERROR_DETAIL_CHARS = 500;

const truncateErrorDetail = (detail: string) =>
	detail.length > MAX_ERROR_DETAIL_CHARS
		? `${detail.slice(0, MAX_ERROR_DETAIL_CHARS)}...`
		: detail;

const readErrorDetail = async (response: Response) => {
	try {
		const data = await response.json();
		if (data && typeof data === 'object' && 'detail' in data) {
			return truncateErrorDetail(String(data.detail));
		}
	} catch {
		// Ignore malformed error bodies and fall back to the status code.
	}
	return `TTS server error: ${response.status}`;
};

const isReleasedAudioPlayerError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes('shared object that was already released') ||
		message.includes('cannot be cast to type expo.modules.audio.AudioPlayer')
	);
};

type UseAssistantAudioParams = {
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	setIsGenerating: Dispatch<SetStateAction<boolean>>;
	onServiceError?: (featureName: string, error: unknown) => void;
};

export const useAssistantAudio = ({
	setIsLoading,
	setIsGenerating,
	onServiceError,
}: UseAssistantAudioParams) => {
	const ttsPlayer = useAudioPlayer(null);
	const ttsAbortControllerRef = useRef<AbortController | null>(null);
	const isPreparingAudioRef = useRef<boolean>(false);
	const hasObservedPlaybackRef = useRef<boolean>(false);
	const playbackRequestedAtRef = useRef<number | null>(null);
	const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

	useEffect(() => {
		const interval = setInterval(() => {
			try {
				if (ttsPlayer?.playing) {
					hasObservedPlaybackRef.current = true;
					setIsAudioPlaying(true);
				} else if (
					!isPreparingAudioRef.current &&
					(hasObservedPlaybackRef.current ||
						(playbackRequestedAtRef.current !== null &&
							Date.now() - playbackRequestedAtRef.current >= PLAYBACK_START_GRACE_MS))
				) {
					hasObservedPlaybackRef.current = false;
					playbackRequestedAtRef.current = null;
					setIsAudioPlaying(false);
				}
			} catch (error) {
				if (!isReleasedAudioPlayerError(error)) {
					console.log('Handled TTS player status read error:', error);
				}
				isPreparingAudioRef.current = false;
				hasObservedPlaybackRef.current = false;
				playbackRequestedAtRef.current = null;
				setIsAudioPlaying(false);
			}
		}, 300);

		return () => clearInterval(interval);
	}, [ttsPlayer]);

	const stopAssistantAudio = useCallback(() => {
		if (ttsAbortControllerRef.current) {
			ttsAbortControllerRef.current.abort();
			ttsAbortControllerRef.current = null;
		}
		const shouldPausePlayer =
			hasObservedPlaybackRef.current || playbackRequestedAtRef.current !== null;
		try {
			if (shouldPausePlayer || ttsPlayer?.playing) {
				ttsPlayer.pause();
			}
		} catch (error) {
			if (!isReleasedAudioPlayerError(error)) {
				console.log('Handled TTS player stop error:', error);
			}
		}
		isPreparingAudioRef.current = false;
		hasObservedPlaybackRef.current = false;
		playbackRequestedAtRef.current = null;
		setIsAudioPlaying(false);
	}, [ttsPlayer]);

	useEffect(
		() => () => {
			ttsAbortControllerRef.current?.abort();
			ttsAbortControllerRef.current = null;
			isPreparingAudioRef.current = false;
			hasObservedPlaybackRef.current = false;
			playbackRequestedAtRef.current = null;
		},
		[],
	);

	const playAssistantAudio = useCallback(
		async (text: string) => {
			const abortController = new AbortController();
			ttsAbortControllerRef.current = abortController;
			isPreparingAudioRef.current = true;
			hasObservedPlaybackRef.current = false;
			playbackRequestedAtRef.current = null;
			setIsAudioPlaying(true);
			let didStartPlayback = false;

			try {
				setIsLoading(true);
				if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
				const authToken = getAuthTokenOrThrow();

				const response = await fetch(`${AUTH_URL}/api/tts`, {
					method: 'POST',
					headers: {
						Accept: 'audio/wav',
						Authorization: `Bearer ${authToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ text }),
					signal: abortController.signal,
				});

				if (!response.ok) {
					throwIfAuthResponseError(response);
					throw new Error(await readErrorDetail(response));
				}
				if (abortController.signal.aborted) return;

				if (Platform.OS === 'web') {
					const blob = await response.blob();
					if (abortController.signal.aborted) return;

					const url = URL.createObjectURL(blob);
					try {
						ttsPlayer.replace(url);
						ttsPlayer.play();
						didStartPlayback = true;
						playbackRequestedAtRef.current = Date.now();
					} catch (error) {
						if (!isReleasedAudioPlayerError(error)) {
							console.log('Handled TTS player playback error:', error);
						}
					}
				} else {
					const arrayBuffer = await response.arrayBuffer();
					if (abortController.signal.aborted) return;

					const base64data = Buffer.from(arrayBuffer).toString('base64');
					const fileUri = (FileSystem.documentDirectory || '') + 'assistant_response.wav';

					await FileSystem.writeAsStringAsync(fileUri, base64data, {
						encoding: FileSystem.EncodingType.Base64,
					});

					if (abortController.signal.aborted) return;

					try {
						ttsPlayer.replace(fileUri);
						ttsPlayer.play();
						didStartPlayback = true;
						playbackRequestedAtRef.current = Date.now();
					} catch (error) {
						if (!isReleasedAudioPlayerError(error)) {
							console.log('Handled TTS player playback error:', error);
						}
					}
				}
			} catch (error: any) {
				if (error.name === 'AbortError') return;
				console.log('Handled assistant TTS error:', error);
				onServiceError?.(getServiceErrorFeature(error, VOICE_OUTPUT_FEATURE), error);
			} finally {
				isPreparingAudioRef.current = false;
				if (!didStartPlayback) {
					hasObservedPlaybackRef.current = false;
					playbackRequestedAtRef.current = null;
					setIsAudioPlaying(false);
				}
				setIsLoading(false);
				setIsGenerating(false);
				if (ttsAbortControllerRef.current === abortController) {
					ttsAbortControllerRef.current = null;
				}
			}
		},
		[onServiceError, setIsGenerating, setIsLoading, ttsPlayer],
	);

	return {
		isAudioPlaying,
		playAssistantAudio,
		stopAssistantAudio,
	};
};
