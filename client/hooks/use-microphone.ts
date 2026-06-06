import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

import { useWakeWord } from '@/hooks/use-wake-word';

const MIN_RECORDING_DURATION_MS = 500;
const RECORDING_SEND_RESERVE_MS = 500;
const MIC_RESTART_COOLDOWN_MS = 500;
const SHORT_MIC_PROCESSING_DURATION_MS = 2000;

const SILENCE_DURATION_MS = 1300;
const INITIAL_SILENCE_DURATION_MS = 5000;
const METERING_CALIBRATION_DURATION_MS = 800;
const MAX_RECORDING_AFTER_SPEECH_MS = 9000;
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
	setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>;
	setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
	onStopExternal: () => void;
	onTranscript: (transcript: string) => void;
};

export const useMicrophone = <TMessage extends VoiceMessage>({
	messages,
	setMessages,
	isLoading,
	isGenerating,
	isAudioPlaying,
	showTextInput,
	setShowTextInput,
	setIsLoading,
	onStopExternal,
	onTranscript,
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
	const handleMicPressRef = useRef<() => Promise<void>>(async () => undefined);
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
	const isMicProcessing =
		!isListening &&
		(hasPendingVoiceInput || isTranscribing || isLoading || isGenerating || isAudioPlaying);

	const clearMetering = useCallback(() => {
		if (meteringIntervalRef.current) {
			clearInterval(meteringIntervalRef.current);
			meteringIntervalRef.current = null;
		}
	}, []);

	const stopRecordingWithoutSending = useCallback(async () => {
		clearMetering();
		shouldCancelAfterStartRef.current = true;
		shouldStopAfterStartRef.current = false;
		shouldDiscardCurrentRecordingRef.current = true;

		if (isStoppingRecordingRef.current) return;

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
	}, [audioRecorder, clearMetering, setIsLoading]);

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
	}, [stopRecordingWithoutSending]);

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

	const sendToDeepgram = useCallback(
		async (uri: string) => {
			const abortController = new AbortController();
			sttAbortControllerRef.current = abortController;
			setIsLoading(true);
			setIsTranscribing(true);
			try {
				const responseFile = await fetch(uri, { signal: abortController.signal });
				const audioBlob = await responseFile.blob();

				const response = await fetch(
					'https://api.deepgram.com/v1/listen?model=nova-3&numerals=true&language=pl&smart_format=true',
					{
						method: 'POST',
						headers: {
							Authorization: `Token ${process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY}`,
							'Content-Type': 'audio/m4a',
						},
						body: audioBlob,
						signal: abortController.signal,
					},
				);

				if (!response.ok) throw new Error(`Deepgram Error ${response.status}`);
				if (abortController.signal.aborted) return;

				const data = await response.json();
				if (abortController.signal.aborted) return;
				const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

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
				console.error('Deepgram Error:', error);
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
		[onTranscript, setIsLoading, setMessages],
	);

	const stopRecordingAndSend = useCallback(async () => {
		clearMetering();
		const shouldDiscardRecording = () => shouldDiscardCurrentRecordingRef.current;

		if (isStoppingRecordingRef.current) return;

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
				sendToDeepgram(uri);
			} else {
				setMessages((prev) =>
					prev.filter((message) => message.id !== userSpeakingMessageIdRef.current),
				);
				setIsLoading(false);
				setIsTranscribing(false);
			}
		} catch (error) {
			console.error('Error while stopping recording:', error);
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
	}, [audioRecorder, clearMetering, sendToDeepgram, setIsLoading, setMessages]);

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
				if (
					now - lastLoudTime.current > SILENCE_DURATION_MS ||
					(speechStartedAtRef.current &&
						now - speechStartedAtRef.current > MAX_RECORDING_AFTER_SPEECH_MS)
				) {
					stopRecordingAndSend();
				}
			} else if (now - lastLoudTime.current > INITIAL_SILENCE_DURATION_MS) {
				stopRecordingAndSend();
			}
		}, 100);
	}, [audioRecorder, soundLevelAnim, stopRecordingAndSend]);

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
			} catch (error) {
				console.error('Error starting recording:', error);
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
		isListening,
		isMicProcessing,
		isMicRestartBlocked,
		onStopExternal,
		setMessages,
		setShowTextInput,
		showTextInput,
		soundLevelAnim,
		startMetering,
		stopRecordingWithoutSending,
		stopRecordingAndSend,
	]);

	handleMicPressRef.current = handleMicPress;

	const handleWakeWordDetected = useCallback(() => {
		void handleMicPressRef.current();
	}, []);

	useWakeWord({
		enabled:
			!isListening &&
			!isLoading &&
			!isTranscribing &&
			!isGenerating &&
			!isAudioPlaying &&
			!isMicRestartBlocked,
		onDetected: handleWakeWordDetected,
	});

	useEffect(() => {
		AudioModule.setAudioModeAsync({
			playsInSilentMode: true,
			allowsRecording: true,
			shouldPlayInBackground: true,
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
