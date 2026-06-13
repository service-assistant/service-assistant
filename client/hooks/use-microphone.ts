import { Buffer } from 'buffer';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';

import {
	addPcmAudioListener,
	addPcmStreamErrorListener,
	isPcmAudioStreamAvailable,
	startPcmAudioStream,
	stopPcmAudioStream,
} from '@/modules/audio-stream';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';

const MIN_RECORDING_DURATION_MS = 500;
const RECORDING_SEND_RESERVE_MS = 500;
const MIC_RESTART_COOLDOWN_MS = 500;
const SHORT_MIC_PROCESSING_DURATION_MS = 2000;

const SILENCE_DURATION_MS = 2500;
const INITIAL_SILENCE_DURATION_MS = 5000;
const METERING_CALIBRATION_DURATION_MS = 800;
const MAX_RECORDING_AFTER_SPEECH_MS = 30000;
const STREAMING_SILENCE_DURATION_MS = 3500;
const STREAMING_INITIAL_SILENCE_DURATION_MS = 15000;
const STREAMING_MAX_RECORDING_AFTER_SPEECH_MS = 45000;
const SPEECH_OVER_NOISE_DB = 8;
const STRONG_SPEECH_OVER_NOISE_DB = 14;
const SPEECH_PEAK_DROP_DB = 7;
const MINIMUM_SPEECH_DB = -52;

type VoiceMessage = {
	id: number;
	sender: 'user' | 'ai';
	text: string;
	isSpeaking?: boolean;
};

type UseMicrophoneParams<TMessage extends VoiceMessage> = {
	messages: TMessage[];
	setMessages: React.Dispatch<React.SetStateAction<TMessage[]>>;
	isLoading: boolean;
	isGenerating: boolean;
	isAudioPlaying: boolean;
	showTextInput: boolean;
	isSpeechInputUnavailable?: boolean;
	serverUrl: string;
	authTokenOverride?: string | null;
	getTranscriptionThreadId: (signal: AbortSignal) => Promise<number>;
	setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>;
	setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
	onStopExternal: () => void;
	onTranscript: (transcript: string) => void;
	onServiceError?: (featureName: string, error: unknown) => void;
	onSpeechInputError?: (error: unknown) => void;
};

type NativeFormDataFile = {
	uri: string;
	name: string;
	type: string;
};

type PcmAudioEventSubscription = {
	remove: () => void;
};

type SttStreamEvent = {
	type?: 'partial' | 'final' | 'error';
	transcript?: string;
	message?: string;
};

const getSttStreamUrl = (serverUrl: string, threadId: number, authToken: string) => {
	const url = new URL(`${serverUrl}/api/threads/${threadId}/messages/transcribe-stream`);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	url.searchParams.set('token', authToken);
	url.searchParams.set('encoding', 'linear16');
	url.searchParams.set('sample_rate', '16000');
	return url.toString();
};

const appendRecordingToFormData = async (formData: FormData, uri: string, signal: AbortSignal) => {
	if (Platform.OS === 'web') {
		const responseFile = await fetch(uri, { signal });
		const audioBlob = await responseFile.blob();
		formData.append('audio', audioBlob, 'recording.m4a');
		return;
	}

	formData.append('audio', {
		uri,
		name: 'recording.m4a',
		type: 'audio/m4a',
	} as NativeFormDataFile as unknown as Blob);
};

export const useMicrophone = <TMessage extends VoiceMessage>({
	messages,
	setMessages,
	isLoading,
	isGenerating,
	isAudioPlaying,
	showTextInput,
	isSpeechInputUnavailable = false,
	serverUrl,
	authTokenOverride,
	getTranscriptionThreadId,
	setShowTextInput,
	setIsLoading,
	onStopExternal,
	onTranscript,
	onServiceError,
	onSpeechInputError,
}: UseMicrophoneParams<TMessage>) => {
	const [isListening, setIsListening] = useState<boolean>(false);
	const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
	const [isMicRestartBlocked, setIsMicRestartBlocked] = useState<boolean>(false);
	const audioRecorder = useAudioRecorder({
		...RecordingPresets.HIGH_QUALITY,
		isMeteringEnabled: true,
	});
	const userSpeakingMessageIdRef = useRef<number>(0);
	const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const soundLevelAnim = useRef(new Animated.Value(0.2)).current;
	const lastLoudTime = useRef<number>(0);
	const hasSpoken = useRef<boolean>(false);
	const ambientNoiseDbRef = useRef<number | null>(null);
	const speechFrameCountRef = useRef<number>(0);
	const meteringStartedAtRef = useRef<number>(0);
	const speechStartedAtRef = useRef<number | null>(null);
	const speechPeakDbRef = useRef<number | null>(null);
	const sttAbortControllerRef = useRef<AbortController | null>(null);
	const sttStreamWebSocketRef = useRef<WebSocket | null>(null);
	const sttStreamCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sttStreamReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pcmAudioSubscriptionRef = useRef<PcmAudioEventSubscription | null>(null);
	const pcmErrorSubscriptionRef = useRef<PcmAudioEventSubscription | null>(null);
	const isStreamingRecordingRef = useRef<boolean>(false);
	const streamedFinalTranscriptRef = useRef<string>('');
	const streamedPartialTranscriptRef = useRef<string>('');
	const hasFinalizedStreamingTranscriptRef = useRef<boolean>(false);
	const isHandlingMicPressRef = useRef<boolean>(false);
	const isStartingRecordingRef = useRef<boolean>(false);
	const isStoppingRecordingRef = useRef<boolean>(false);
	const shouldStopAfterStartRef = useRef<boolean>(false);
	const shouldCancelAfterStartRef = useRef<boolean>(false);
	const shouldDiscardCurrentRecordingRef = useRef<boolean>(false);
	const recordingStartedAtRef = useRef<number | null>(null);
	const micRestartBlockedUntilRef = useRef<number>(0);
	const micRestartCooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const wasMicProcessingRef = useRef<boolean>(false);
	const micProcessingStartedAtRef = useRef<number | null>(null);
	const hasPendingVoiceInput = messages.some((message) => message.isSpeaking);
	const canStreamPcmAudio = Platform.OS === 'android' && isPcmAudioStreamAvailable;
	const isMicProcessing =
		!isListening &&
		(hasPendingVoiceInput || isTranscribing || isLoading || isGenerating || isAudioPlaying);

	const clearMetering = useCallback(() => {
		if (meteringIntervalRef.current) {
			clearInterval(meteringIntervalRef.current);
			meteringIntervalRef.current = null;
		}
	}, []);

	const removePcmStreamListeners = useCallback(() => {
		pcmAudioSubscriptionRef.current?.remove();
		pcmAudioSubscriptionRef.current = null;
		pcmErrorSubscriptionRef.current?.remove();
		pcmErrorSubscriptionRef.current = null;
	}, []);

	const closeSttStreamSocket = useCallback(() => {
		if (sttStreamCloseTimeoutRef.current) {
			clearTimeout(sttStreamCloseTimeoutRef.current);
			sttStreamCloseTimeoutRef.current = null;
		}
		if (sttStreamReconnectTimeoutRef.current) {
			clearTimeout(sttStreamReconnectTimeoutRef.current);
			sttStreamReconnectTimeoutRef.current = null;
		}

		const socket = sttStreamWebSocketRef.current;
		sttStreamWebSocketRef.current = null;

		if (socket && socket.readyState !== WebSocket.CLOSED) {
			socket.close();
		}
	}, []);

	const stopRecordingWithoutSending = useCallback(async () => {
		clearMetering();
		shouldCancelAfterStartRef.current = true;
		shouldStopAfterStartRef.current = false;
		shouldDiscardCurrentRecordingRef.current = true;

		if (isStoppingRecordingRef.current) return;

		if (isStreamingRecordingRef.current || sttStreamWebSocketRef.current) {
			removePcmStreamListeners();
			await stopPcmAudioStream();
			closeSttStreamSocket();
			isStreamingRecordingRef.current = false;
			recordingStartedAtRef.current = null;
			setIsListening(false);
			setIsLoading(false);
			setIsTranscribing(false);
			return;
		}

		if (isStartingRecordingRef.current && !audioRecorder.isRecording) {
			setIsListening(false);
			return;
		}

		if (!audioRecorder.isRecording) {
			setIsListening(false);
			setIsLoading(false);
			setIsTranscribing(false);
			return;
		}

		isStoppingRecordingRef.current = true;
		setIsListening(false);

		try {
			await audioRecorder.stop();
		} catch (error) {
			console.error('Error while cancelling recording:', error);
		} finally {
			isStoppingRecordingRef.current = false;
			recordingStartedAtRef.current = null;
			setIsLoading(false);
			setIsTranscribing(false);
		}
	}, [
		audioRecorder,
		clearMetering,
		closeSttStreamSocket,
		removePcmStreamListeners,
		setIsLoading,
	]);

	const abortVoiceInput = useCallback(() => {
		void stopRecordingWithoutSending();
		if (sttAbortControllerRef.current) {
			sttAbortControllerRef.current.abort();
			sttAbortControllerRef.current = null;
		}
		setIsListening(false);
		setIsTranscribing(false);
		setMessages((prev) => prev.filter((message) => !message.isSpeaking));
	}, [setMessages, stopRecordingWithoutSending]);

	const resetVoiceInput = useCallback(() => {
		void stopRecordingWithoutSending();
		setIsListening(false);
		setIsTranscribing(false);
		if (sttAbortControllerRef.current) {
			sttAbortControllerRef.current.abort();
			sttAbortControllerRef.current = null;
		}
	}, [onServiceError, stopRecordingWithoutSending]);

	const blockMicRestart = useCallback(() => {
		micRestartBlockedUntilRef.current = Date.now() + MIC_RESTART_COOLDOWN_MS;
		setIsMicRestartBlocked(true);

		if (micRestartCooldownTimeoutRef.current) {
			clearTimeout(micRestartCooldownTimeoutRef.current);
		}

		micRestartCooldownTimeoutRef.current = setTimeout(() => {
			micRestartBlockedUntilRef.current = 0;
			micRestartCooldownTimeoutRef.current = null;
			setIsMicRestartBlocked(false);
		}, MIC_RESTART_COOLDOWN_MS);
	}, []);

	const updateStreamingTranscriptMessage = useCallback(() => {
		const transcript = [
			streamedFinalTranscriptRef.current,
			streamedPartialTranscriptRef.current,
		]
			.filter((part) => part.trim().length > 0)
			.join(' ')
			.trim();

		setMessages((prev) =>
			prev.map((message) =>
				message.id === userSpeakingMessageIdRef.current
					? ({ ...message, text: transcript, isSpeaking: true } as TMessage)
					: message,
			),
		);
	}, [setMessages]);

	const finalizeStreamingTranscript = useCallback(
		(error?: unknown) => {
			if (hasFinalizedStreamingTranscriptRef.current) return;
			hasFinalizedStreamingTranscriptRef.current = true;

			removePcmStreamListeners();
			void stopPcmAudioStream();
			closeSttStreamSocket();
			clearMetering();
			isStreamingRecordingRef.current = false;
			recordingStartedAtRef.current = null;
			sttAbortControllerRef.current = null;
			setIsListening(false);

			if (error) {
				onSpeechInputError?.(error);
				onServiceError?.(getServiceErrorFeature(error, 'rozpoznawanie mowy'), error);
			}

			const transcript = [
				streamedFinalTranscriptRef.current,
				streamedPartialTranscriptRef.current,
			]
				.filter((part) => part.trim().length > 0)
				.join(' ')
				.trim();

			if (!error && transcript.length > 0) {
				setMessages((prev) =>
					prev.map((message) =>
						message.id === userSpeakingMessageIdRef.current
							? ({ ...message, text: transcript, isSpeaking: false } as TMessage)
							: message,
					),
				);
				onTranscript(transcript);
				setIsTranscribing(false);
				return;
			}

			setMessages((prev) =>
				prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
			);
			setIsLoading(false);
			setIsTranscribing(false);
		},
		[
			clearMetering,
			closeSttStreamSocket,
			onServiceError,
			onSpeechInputError,
			onTranscript,
			removePcmStreamListeners,
			setIsLoading,
			setMessages,
		],
	);

	const transcribeWithServer = useCallback(
		async (uri: string) => {
			const abortController = new AbortController();
			sttAbortControllerRef.current = abortController;
			setIsLoading(true);
			setIsTranscribing(true);
			try {
				const authToken = authTokenOverride ?? getAuthTokenOrThrow();
				const threadId = await getTranscriptionThreadId(abortController.signal);
				const formData = new FormData();
				await appendRecordingToFormData(formData, uri, abortController.signal);

				const response = await fetch(
					`${serverUrl}/api/threads/${threadId}/messages/transcribe`,
					{
						method: 'POST',
						headers: {
							Authorization: `Bearer ${authToken}`,
						},
						body: formData,
						signal: abortController.signal,
					},
				);

				if (!response.ok) {
					throwIfAuthResponseError(response);
					throw new Error(`Speech transcription error: ${response.status}`);
				}
				if (abortController.signal.aborted) return;

				const data = (await response.json()) as { transcript?: string };
				if (abortController.signal.aborted) return;
				const transcript = data.transcript || '';

				if (transcript.trim().length > 0) {
					setMessages((prev) =>
						prev.map((message) =>
							message.id === userSpeakingMessageIdRef.current
								? ({ ...message, text: transcript, isSpeaking: false } as TMessage)
								: message,
						),
					);
					onTranscript(transcript);
					setIsTranscribing(false);
				} else {
					setMessages((prev) =>
						prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
					);
					setIsLoading(false);
					setIsTranscribing(false);
				}
			} catch (error: any) {
				if (error.name === 'AbortError') {
					setMessages((prev) =>
						prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
					);
					return;
				}
				onSpeechInputError?.(error);
				onServiceError?.(getServiceErrorFeature(error, 'rozpoznawanie mowy'), error);
				setMessages((prev) =>
					prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
				setIsTranscribing(false);
			} finally {
				if (sttAbortControllerRef.current === abortController) {
					sttAbortControllerRef.current = null;
				}
			}
		},
		[
			authTokenOverride,
			getTranscriptionThreadId,
			onServiceError,
			onSpeechInputError,
			onTranscript,
			serverUrl,
			setIsLoading,
			setMessages,
		],
	);

	const stopRecordingAndSend = useCallback(async () => {
		clearMetering();
		const shouldDiscardRecording = () => shouldDiscardCurrentRecordingRef.current;

		if (isStoppingRecordingRef.current) return;

		if (isStreamingRecordingRef.current) {
			isStoppingRecordingRef.current = true;
			setIsTranscribing(true);
			setIsLoading(true);
			setIsListening(false);

			try {
				const recordingStartedAt = recordingStartedAtRef.current;
				if (recordingStartedAt) {
					const remainingRecordingTime =
						MIN_RECORDING_DURATION_MS - (Date.now() - recordingStartedAt);
					if (remainingRecordingTime > 0) {
						await new Promise((resolve) => setTimeout(resolve, remainingRecordingTime));
					}
				}

				removePcmStreamListeners();
				await stopPcmAudioStream();
				isStreamingRecordingRef.current = false;
				recordingStartedAtRef.current = null;

				if (shouldDiscardRecording()) {
					finalizeStreamingTranscript(new Error('Voice input cancelled'));
					return;
				}

				finalizeStreamingTranscript();
			} catch (error) {
				finalizeStreamingTranscript(error);
			} finally {
				isStoppingRecordingRef.current = false;
				shouldDiscardCurrentRecordingRef.current = false;
			}
			return;
		}

		if (isStartingRecordingRef.current && !audioRecorder.isRecording) {
			shouldStopAfterStartRef.current = true;
			setIsListening(false);
			return;
		}

		if (!audioRecorder.isRecording) {
			setIsListening(false);
			setIsLoading(false);
			setIsTranscribing(false);
			return;
		}

		isStoppingRecordingRef.current = true;
		setIsTranscribing(true);
		setIsLoading(true);
		setIsListening(false);

		try {
			const recordingStartedAt = recordingStartedAtRef.current;
			if (recordingStartedAt) {
				const remainingRecordingTime =
					MIN_RECORDING_DURATION_MS - (Date.now() - recordingStartedAt);
				if (remainingRecordingTime > 0) {
					await new Promise((resolve) => setTimeout(resolve, remainingRecordingTime));
				}
			}

			await new Promise((resolve) => setTimeout(resolve, RECORDING_SEND_RESERVE_MS));
			await audioRecorder.stop();
			const uri = audioRecorder.uri;

			if (shouldDiscardRecording()) {
				setMessages((prev) =>
					prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
				setIsTranscribing(false);
			} else if (uri) {
				transcribeWithServer(uri);
			} else {
				setMessages((prev) =>
					prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
				setIsTranscribing(false);
			}
		} catch (error) {
			onServiceError?.('nagrywanie głosu', error);
			setMessages((prev) =>
				prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
			);
			setIsLoading(false);
			setIsTranscribing(false);
		} finally {
			isStoppingRecordingRef.current = false;
			recordingStartedAtRef.current = null;
			shouldDiscardCurrentRecordingRef.current = false;
		}
	}, [
		audioRecorder,
		clearMetering,
		finalizeStreamingTranscript,
		onServiceError,
		removePcmStreamListeners,
		setIsLoading,
		setMessages,
		transcribeWithServer,
	]);

	const processMetering = useCallback(
		(metering: number) => {
			const now = Date.now();
			const elapsed = now - meteringStartedAtRef.current;
			const previousAmbient = ambientNoiseDbRef.current ?? metering;

			let newScale = 0.2;
			if (metering > -50) {
				newScale = ((metering + 50) / 50) * (1.5 - 0.2) + 0.2;
			}
			newScale = Math.max(0.2, Math.min(1.5, newScale));

			Animated.timing(soundLevelAnim, {
				toValue: newScale,
				duration: 100,
				useNativeDriver: true,
			}).start();

			if (elapsed < METERING_CALIBRATION_DURATION_MS) {
				ambientNoiseDbRef.current = previousAmbient + (metering - previousAmbient) * 0.35;
				return;
			}

			const ambientNoise = ambientNoiseDbRef.current ?? metering;
			const speechThreshold = Math.max(
				ambientNoise + SPEECH_OVER_NOISE_DB,
				MINIMUM_SPEECH_DB,
			);
			const isSpeechCandidate = metering >= speechThreshold;
			const speechPeak = speechPeakDbRef.current ?? metering;
			const strongSpeechThreshold = Math.max(
				ambientNoise + STRONG_SPEECH_OVER_NOISE_DB,
				speechPeak - SPEECH_PEAK_DROP_DB,
				MINIMUM_SPEECH_DB,
			);
			const isSpeechLike = !hasSpoken.current
				? isSpeechCandidate
				: metering >= strongSpeechThreshold;

			if (isSpeechLike) {
				speechFrameCountRef.current += 1;
				speechPeakDbRef.current =
					speechPeakDbRef.current === null
						? metering
						: Math.max(speechPeakDbRef.current - 0.25, metering);
				ambientNoiseDbRef.current =
					ambientNoise + (metering - ambientNoise) * (hasSpoken.current ? 0.004 : 0.02);
			} else {
				speechFrameCountRef.current = 0;
				const adaptationRate = hasSpoken.current ? 0.1 : 0.12;
				ambientNoiseDbRef.current =
					ambientNoise + (metering - ambientNoise) * adaptationRate;
				if (speechPeakDbRef.current !== null) {
					speechPeakDbRef.current = Math.max(
						ambientNoiseDbRef.current + STRONG_SPEECH_OVER_NOISE_DB,
						speechPeakDbRef.current - 0.8,
					);
				}
			}

			if (speechFrameCountRef.current >= 2) {
				lastLoudTime.current = now;
				hasSpoken.current = true;
				if (!speechStartedAtRef.current) {
					speechStartedAtRef.current = now;
				}
			} else if (hasSpoken.current) {
				const silenceDuration = isStreamingRecordingRef.current
					? STREAMING_SILENCE_DURATION_MS
					: SILENCE_DURATION_MS;
				const maxRecordingAfterSpeech = isStreamingRecordingRef.current
					? STREAMING_MAX_RECORDING_AFTER_SPEECH_MS
					: MAX_RECORDING_AFTER_SPEECH_MS;
				if (
					now - lastLoudTime.current > silenceDuration ||
					(speechStartedAtRef.current &&
						now - speechStartedAtRef.current > maxRecordingAfterSpeech)
				) {
					stopRecordingAndSend();
				}
			} else if (
				now - lastLoudTime.current >
				(isStreamingRecordingRef.current
					? STREAMING_INITIAL_SILENCE_DURATION_MS
					: INITIAL_SILENCE_DURATION_MS)
			) {
				stopRecordingAndSend();
			}
		},
		[soundLevelAnim, stopRecordingAndSend],
	);

	const startMetering = useCallback(() => {
		lastLoudTime.current = Date.now();
		hasSpoken.current = false;
		ambientNoiseDbRef.current = null;
		speechFrameCountRef.current = 0;
		meteringStartedAtRef.current = Date.now();
		speechStartedAtRef.current = null;
		speechPeakDbRef.current = null;

		meteringIntervalRef.current = setInterval(() => {
			const status = audioRecorder.getStatus();

			if (!status.isRecording) return;

			const metering = status.metering ?? -160;
			processMetering(metering);
		}, 100);
	}, [audioRecorder, processMetering]);

	const startStreamingRecording = useCallback(async () => {
		const abortController = new AbortController();
		sttAbortControllerRef.current = abortController;
		const authToken = authTokenOverride ?? getAuthTokenOrThrow();
		const threadId = await getTranscriptionThreadId(abortController.signal);
		if (abortController.signal.aborted) return;

		streamedFinalTranscriptRef.current = '';
		streamedPartialTranscriptRef.current = '';
		hasFinalizedStreamingTranscriptRef.current = false;

		const connectSttStreamSocket = async (isReconnect = false) => {
			const socket = new WebSocket(getSttStreamUrl(serverUrl, threadId, authToken));
			sttStreamWebSocketRef.current = socket;

			await new Promise<void>((resolve, reject) => {
				let settled = false;
				const settleOnce = (callback: () => void) => {
					if (settled) return;
					settled = true;
					callback();
				};

				socket.onopen = () => settleOnce(resolve);
				socket.onerror = () =>
					settleOnce(() =>
						reject(
							new Error(
								isReconnect
									? 'STT stream reconnect failed'
									: 'STT stream connection failed',
							),
						),
					);
			});

			if (abortController.signal.aborted || hasFinalizedStreamingTranscriptRef.current) {
				socket.close();
				return;
			}

			socket.onmessage = (event) => {
				try {
					const data = JSON.parse(String(event.data)) as SttStreamEvent;
					if (data.type === 'error') {
						finalizeStreamingTranscript(new Error(data.message || 'STT stream error'));
						return;
					}

					const transcript = (data.transcript || '').trim();
					if (!transcript) return;

					lastLoudTime.current = Date.now();
					hasSpoken.current = true;
					if (!speechStartedAtRef.current) {
						speechStartedAtRef.current = lastLoudTime.current;
					}

					if (data.type === 'final') {
						streamedFinalTranscriptRef.current = [
							streamedFinalTranscriptRef.current,
							transcript,
						]
							.filter((part) => part.trim().length > 0)
							.join(' ')
							.trim();
						streamedPartialTranscriptRef.current = '';
					} else {
						streamedPartialTranscriptRef.current = transcript;
					}

					updateStreamingTranscriptMessage();
				} catch (error) {
					finalizeStreamingTranscript(error);
				}
			};
			socket.onerror = () => {
				if (!isStreamingRecordingRef.current) {
					finalizeStreamingTranscript(new Error('STT stream connection failed'));
				}
			};
			socket.onclose = () => {
				if (sttStreamWebSocketRef.current === socket) {
					sttStreamWebSocketRef.current = null;
				}

				if (
					hasFinalizedStreamingTranscriptRef.current ||
					!isStreamingRecordingRef.current ||
					isStoppingRecordingRef.current ||
					shouldDiscardCurrentRecordingRef.current
				) {
					return;
				}

				if (sttStreamReconnectTimeoutRef.current) {
					clearTimeout(sttStreamReconnectTimeoutRef.current);
				}
				sttStreamReconnectTimeoutRef.current = setTimeout(() => {
					sttStreamReconnectTimeoutRef.current = null;
					void connectSttStreamSocket(true).catch((error) => {
						finalizeStreamingTranscript(error);
					});
				}, 100);
			};
		};

		await connectSttStreamSocket();

		pcmAudioSubscriptionRef.current = addPcmAudioListener((event) => {
			try {
				processMetering(event.metering);
				const socket = sttStreamWebSocketRef.current;
				if (!socket || socket.readyState !== WebSocket.OPEN) return;

				const bytes = Buffer.from(event.pcm, 'base64');
				const audioBytes = bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength,
				);
				socket.send(audioBytes);
			} catch (error) {
				finalizeStreamingTranscript(error);
			}
		});
		pcmErrorSubscriptionRef.current = addPcmStreamErrorListener((event) => {
			finalizeStreamingTranscript(new Error(event.message));
		});

		lastLoudTime.current = Date.now();
		hasSpoken.current = false;
		ambientNoiseDbRef.current = null;
		speechFrameCountRef.current = 0;
		meteringStartedAtRef.current = Date.now();
		speechStartedAtRef.current = null;
		speechPeakDbRef.current = null;
		await startPcmAudioStream();
		if (abortController.signal.aborted) {
			finalizeStreamingTranscript();
			return;
		}

		isStreamingRecordingRef.current = true;
		recordingStartedAtRef.current = Date.now();
	}, [
		authTokenOverride,
		finalizeStreamingTranscript,
		getTranscriptionThreadId,
		processMetering,
		serverUrl,
		updateStreamingTranscriptMessage,
	]);

	useEffect(() => {
		if (!wasMicProcessingRef.current && isMicProcessing) {
			micProcessingStartedAtRef.current = Date.now();
		}

		if (wasMicProcessingRef.current && !isMicProcessing) {
			const processingStartedAt = micProcessingStartedAtRef.current;
			if (
				processingStartedAt &&
				Date.now() - processingStartedAt < SHORT_MIC_PROCESSING_DURATION_MS
			) {
				blockMicRestart();
			}
			micProcessingStartedAtRef.current = null;
		}

		wasMicProcessingRef.current = isMicProcessing;
	}, [blockMicRestart, isMicProcessing]);

	const handleMicPress = useCallback(async () => {
		if (isHandlingMicPressRef.current) return;
		isHandlingMicPressRef.current = true;

		try {
			if (showTextInput) setShowTextInput(false);

			if (isStoppingRecordingRef.current) return;

			if (isListening || isStartingRecordingRef.current || audioRecorder.isRecording) {
				await stopRecordingAndSend();
				return;
			}

			if (isMicRestartBlocked || Date.now() < micRestartBlockedUntilRef.current) return;

			if (isMicProcessing) {
				onStopExternal();
				const processingStartedAt = micProcessingStartedAtRef.current;
				if (
					processingStartedAt &&
					Date.now() - processingStartedAt < SHORT_MIC_PROCESSING_DURATION_MS
				) {
					blockMicRestart();
				}
				return;
			}

			try {
				authTokenOverride ?? getAuthTokenOrThrow();
			} catch (error) {
				onSpeechInputError?.(error);
				onServiceError?.(getServiceErrorFeature(error, 'rozpoznawanie mowy'), error);
				setIsListening(false);
				setIsLoading(false);
				setIsTranscribing(false);
				return;
			}

			onStopExternal();
			isStartingRecordingRef.current = true;
			shouldStopAfterStartRef.current = false;
			shouldCancelAfterStartRef.current = false;
			shouldDiscardCurrentRecordingRef.current = false;
			setIsListening(true);

			const userTempId = Date.now();
			userSpeakingMessageIdRef.current = userTempId;
			soundLevelAnim.setValue(0.2);

			setMessages((prev) => [
				...prev,
				{ id: userTempId, sender: 'user', text: '', isSpeaking: true } as TMessage,
			]);

			try {
				const permission = await AudioModule.requestRecordingPermissionsAsync();
				if (!permission.granted) {
					setIsListening(false);
					setMessages((prev) => prev.filter((message) => message.id !== userTempId));
					return;
				}

				if (shouldCancelAfterStartRef.current) {
					setMessages((prev) => prev.filter((message) => message.id !== userTempId));
					return;
				}

				if (canStreamPcmAudio) {
					await startStreamingRecording();
					isStartingRecordingRef.current = false;

					if (shouldCancelAfterStartRef.current) {
						await stopRecordingWithoutSending();
						setMessages((prev) => prev.filter((message) => message.id !== userTempId));
					} else if (shouldStopAfterStartRef.current) {
						await stopRecordingAndSend();
					}
				} else {
					await audioRecorder.prepareToRecordAsync();
					audioRecorder.record();
					recordingStartedAtRef.current = Date.now();
					isStartingRecordingRef.current = false;

					if (shouldCancelAfterStartRef.current) {
						await stopRecordingWithoutSending();
						setMessages((prev) => prev.filter((message) => message.id !== userTempId));
					} else if (shouldStopAfterStartRef.current) {
						await stopRecordingAndSend();
					} else {
						startMetering();
					}
				}
			} catch (error) {
				removePcmStreamListeners();
				void stopPcmAudioStream();
				closeSttStreamSocket();
				onServiceError?.('nagrywanie głosu', error);
				setIsListening(false);
				setMessages((prev) => prev.filter((message) => message.id !== userTempId));
			} finally {
				isStartingRecordingRef.current = false;
			}
		} finally {
			isHandlingMicPressRef.current = false;
		}
	}, [
		audioRecorder,
		blockMicRestart,
		canStreamPcmAudio,
		closeSttStreamSocket,
		isListening,
		isMicProcessing,
		isMicRestartBlocked,
		authTokenOverride,
		onStopExternal,
		onServiceError,
		onSpeechInputError,
		removePcmStreamListeners,
		setMessages,
		setShowTextInput,
		setIsLoading,
		showTextInput,
		soundLevelAnim,
		startStreamingRecording,
		startMetering,
		stopRecordingWithoutSending,
		stopRecordingAndSend,
	]);

	useEffect(() => {
		AudioModule.setAudioModeAsync({
			playsInSilentMode: true,
			allowsRecording: true,
			shouldPlayInBackground: true,
		}).catch((error) => {
			onServiceError?.('nagrywanie głosu', error);
		});

		return () => {
			void stopRecordingWithoutSending();
			if (sttAbortControllerRef.current) sttAbortControllerRef.current.abort();
			if (micRestartCooldownTimeoutRef.current) {
				clearTimeout(micRestartCooldownTimeoutRef.current);
			}
		};
	}, [stopRecordingWithoutSending]);

	return {
		abortVoiceInput,
		handleMicPress,
		isListening,
		isMicProcessing,
		isMicRestartBlocked,
		isTranscribing,
		resetVoiceInput,
		soundLevelAnim,
	};
};
