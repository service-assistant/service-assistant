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
			void stopWakeWordDetection();
			return;
		}

		if (!isWakeWordAvailable) {
			void stopWakeWordDetection();
			return;
		}

		if (!enabled) {
			void stopWakeWordDetection();
			return;
		}

		const detectionSubscription = addWakeWordListener((event) => {
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
					return;
				}

				return startWakeWordDetection().then(() => {
					if (cancelled) {
						return stopWakeWordDetection();
					}
				});
			})
			.catch((error) => {
				console.warn('[WakeWord] Failed to start detection:', error);
			});

		return () => {
			cancelled = true;
			detectionSubscription.remove();
			errorSubscription.remove();
			void stopWakeWordDetection();
		};
	}, [enabled, onDetected]);
};
