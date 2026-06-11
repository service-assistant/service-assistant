import { AudioModule } from 'expo-audio';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import {
	addWakeWordErrorListener,
	addWakeWordListener,
	isWakeWordAvailable,
	startWakeWordDetection,
	stopWakeWordDetection,
} from '@/modules/wake-word';

type UseWakeWordOptions = {
	enabled: boolean;
	onDetected: () => void;
};

export const useWakeWord = ({ enabled, onDetected }: UseWakeWordOptions) => {
	useEffect(() => {
		if (Platform.OS !== 'android') {
			console.log('[WakeWord] Disabled: Android-only module is not available on this platform.');
			void stopWakeWordDetection();
			return;
		}

		if (!isWakeWordAvailable) {
			console.log('[WakeWord] Disabled: native module is unavailable.');
			void stopWakeWordDetection();
			return;
		}

		if (!enabled) {
			console.log('[WakeWord] Disabled: voice input is busy or wake word is not enabled.');
			void stopWakeWordDetection();
			return;
		}

		console.log('[WakeWord] Preparing detection.');
		const detectionSubscription = addWakeWordListener((event) => {
			console.log(`[WakeWord] Detected with probability ${event.probability.toFixed(4)}.`);
			void stopWakeWordDetection().finally(onDetected);
		});
		const errorSubscription = addWakeWordErrorListener((event) => {
			console.warn(`[WakeWord] Native error: ${event.message}`);
		});
		let cancelled = false;

		void AudioModule.requestRecordingPermissionsAsync()
			.then((permission) => {
				if (!permission.granted) {
					console.warn('[WakeWord] Microphone permission denied.');
					return;
				}

				if (cancelled) {
					console.log('[WakeWord] Startup cancelled before native detection started.');
					return;
				}

				return startWakeWordDetection().then(() => {
					console.log('[WakeWord] Detection started.');
					if (cancelled) {
						console.log('[WakeWord] Startup finished after cleanup; stopping detection.');
						return stopWakeWordDetection();
					}
				});
			})
			.catch((error) => {
				console.warn('[WakeWord] Failed to start detection:', error);
			});

		return () => {
			cancelled = true;
			console.log('[WakeWord] Cleaning up detection.');
			detectionSubscription.remove();
			errorSubscription.remove();
			void stopWakeWordDetection();
		};
	}, [enabled, onDetected]);
};
