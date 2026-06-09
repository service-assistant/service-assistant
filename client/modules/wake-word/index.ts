import { EventSubscription, requireOptionalNativeModule } from 'expo-modules-core';

type WakeWordDetection = {
	probability: number;
};

type WakeWordError = {
	message: string;
};

type WakeWordNativeModule = {
	start(threshold: number, requiredHits: number, cooldownMillis: number): Promise<void>;
	stop(): Promise<void>;
	addListener(
		eventName: 'onWakeWord',
		listener: (event: WakeWordDetection) => void,
	): EventSubscription;
	addListener(
		eventName: 'onWakeWordError',
		listener: (event: WakeWordError) => void,
	): EventSubscription;
};

const nativeModule = requireOptionalNativeModule<WakeWordNativeModule>('WakeWord');

export const isWakeWordAvailable = nativeModule !== null;

export const startWakeWordDetection = (threshold = 0.89, requiredHits = 2, cooldownMillis = 1500) =>
	nativeModule?.start(threshold, requiredHits, cooldownMillis) ?? Promise.resolve();

export const stopWakeWordDetection = () => nativeModule?.stop() ?? Promise.resolve();

export const addWakeWordListener = (listener: (event: WakeWordDetection) => void) =>
	nativeModule?.addListener('onWakeWord', listener) ?? { remove: () => undefined };

export const addWakeWordErrorListener = (listener: (event: WakeWordError) => void) =>
	nativeModule?.addListener('onWakeWordError', listener) ?? { remove: () => undefined };
