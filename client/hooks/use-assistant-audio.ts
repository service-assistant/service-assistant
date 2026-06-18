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

import * as FileSystem from 'expo-file-system/legacy';

const PLAYBACK_START_GRACE_MS = 1000;

const isReleasedAudioPlayerError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes('shared object that was already released') ||
		message.includes('cannot be cast to type expo.modules.audio.AudioPlayer')
	);
};

const getOpenAiApiKeyOrThrow = () => {
	const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY?.trim();

	if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
		throw Object.assign(new Error('Missing EXPO_PUBLIC_OPENAI_API_KEY'), {
			isOpenAiKeyError: true,
		});
	}

	return apiKey;
};

type UseAssistantAudioParams = {
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	setIsGenerating: Dispatch<SetStateAction<boolean>>;
	onServiceError?: (featureName: string, error: unknown) => void;
	onOpenAiKeyError?: (error: unknown) => void;
};

export const useAssistantAudio = ({
	setIsLoading,
	setIsGenerating,
	onServiceError,
	onOpenAiKeyError,
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
				const apiKey = getOpenAiApiKeyOrThrow();

				const response = await fetch('https://api.openai.com/v1/audio/speech', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey.trim()}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						model: 'tts-1',
						input: text,
						voice: 'alloy',
					}),
					signal: abortController.signal,
				});

				if (!response.ok) {
					throw Object.assign(new Error(`OpenAI API error: ${response.status}`), {
						isOpenAiKeyError: response.status === 401 || response.status === 403,
					});
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
					const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';

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
				console.log('Handled ChatGPT TTS error:', error);
				if (error?.isOpenAiKeyError) {
					onOpenAiKeyError?.(error);
				} else {
					onServiceError?.('odtwarzanie odpowiedzi głosowej', error);
				}
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
		[onOpenAiKeyError, onServiceError, setIsGenerating, setIsLoading, ttsPlayer],
	);

	return {
		isAudioPlaying,
		playAssistantAudio,
		stopAssistantAudio,
	};
};
