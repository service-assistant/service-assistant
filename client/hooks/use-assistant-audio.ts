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
import EventSource, { EventSourceEvent } from 'react-native-sse';

import * as FileSystem from 'expo-file-system/legacy';
import {
	enqueuePcmAudioPlaybackChunk,
	isPcmAudioPlaybackAvailable,
	startPcmAudioPlayback,
	stopPcmAudioPlayback,
} from '@/modules/audio-stream';
import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	createInvalidAuthTokenError,
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';

const PLAYBACK_START_GRACE_MS = 1000;
const VOICE_OUTPUT_FEATURE = 'odtwarzanie odpowiedzi głosowej';
const MAX_ERROR_DETAIL_CHARS = 500;

type TtsStreamEvent = 'audio_chunk' | 'audio_done' | 'tts_error';

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
	const ttsEventSourceRef = useRef<EventSource<TtsStreamEvent> | null>(null);
	const isPreparingAudioRef = useRef<boolean>(false);
	const hasObservedPlaybackRef = useRef<boolean>(false);
	const isNativePlaybackActiveRef = useRef<boolean>(false);
	const playbackRequestedAtRef = useRef<number | null>(null);
	const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

	useEffect(() => {
		const interval = setInterval(() => {
			try {
				if (isNativePlaybackActiveRef.current) {
					setIsAudioPlaying(true);
				} else if (ttsPlayer?.playing) {
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
		if (ttsEventSourceRef.current) {
			ttsEventSourceRef.current.close();
			ttsEventSourceRef.current = null;
		}
		if (isNativePlaybackActiveRef.current) {
			void stopPcmAudioPlayback();
			isNativePlaybackActiveRef.current = false;
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
			ttsEventSourceRef.current?.close();
			ttsEventSourceRef.current = null;
			isNativePlaybackActiveRef.current = false;
			void stopPcmAudioPlayback();
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

				if (Platform.OS === 'android' && isPcmAudioPlaybackAvailable) {
					await startPcmAudioPlayback();
					isNativePlaybackActiveRef.current = true;
					didStartPlayback = true;
					playbackRequestedAtRef.current = Date.now();

					await new Promise<void>((resolve, reject) => {
						const eventSource = new EventSource<TtsStreamEvent>(`${AUTH_URL}/api/tts/stream`, {
							method: 'POST',
							headers: {
								Accept: 'text/event-stream',
								Authorization: `Bearer ${authToken}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({ text }),
							pollingInterval: 0,
							timeoutBeforeConnection: 0,
						});
						ttsEventSourceRef.current = eventSource;

						const closeStream = () => {
							eventSource.close();
							abortController.signal.removeEventListener('abort', handleAbort);
							if (ttsEventSourceRef.current === eventSource) {
								ttsEventSourceRef.current = null;
							}
						};

						const handleAbort = () => {
							closeStream();
							resolve();
						};

						const handleAudioChunk = (event: EventSourceEvent<'audio_chunk'>) => {
							if (abortController.signal.aborted || !event.data) return;
							void enqueuePcmAudioPlaybackChunk(event.data);
						};

						const handleAudioDone = () => {
							closeStream();
							resolve();
						};

						const handleTtsError = (event: EventSourceEvent<'tts_error'>) => {
							closeStream();
							reject(new Error(event.data || 'TTS stream error'));
						};

						const handleError = (event: EventSourceEvent<'error'>) => {
							closeStream();
							if (abortController.signal.aborted) {
								resolve();
								return;
							}
							if ('xhrStatus' in event) {
								const status = Number(event.xhrStatus);
								if (status === 401 || status === 403) {
									reject(createInvalidAuthTokenError(status));
									return;
								}
								reject(new Error(`TTS stream server error: ${event.xhrStatus}`));
							} else if ('message' in event) {
								reject(new Error(event.message));
							} else {
								reject(new Error('TTS stream error'));
							}
						};

						abortController.signal.addEventListener('abort', handleAbort);
						eventSource.addEventListener('audio_chunk', handleAudioChunk);
						eventSource.addEventListener('audio_done', handleAudioDone);
						eventSource.addEventListener('tts_error', handleTtsError);
						eventSource.addEventListener('error', handleError);
					});

					isNativePlaybackActiveRef.current = false;
					return;
				}

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
				if (isNativePlaybackActiveRef.current) {
					isNativePlaybackActiveRef.current = false;
					void stopPcmAudioPlayback();
				}
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
