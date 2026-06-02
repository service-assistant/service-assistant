import { useEffect } from 'react';
import { Platform } from 'react-native';
import { AudioModule } from 'expo-audio';

import {
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
		if (Platform.OS !== 'android' || !isWakeWordAvailable || !enabled) {
			void stopWakeWordDetection();
			return;
		}

		const detectionSubscription = addWakeWordListener(() => {
			void stopWakeWordDetection().finally(onDetected);
		});
		let cancelled = false;

		void AudioModule.requestRecordingPermissionsAsync()
			.then((permission) => {
				if (!permission.granted || cancelled) return;

				return startWakeWordDetection().then(() => {
					if (cancelled) {
						return stopWakeWordDetection();
					}
				});
			})
			.catch(() => undefined);

		return () => {
			cancelled = true;
			detectionSubscription.remove();
			void stopWakeWordDetection();
		};
	}, [enabled, onDetected]);
};
