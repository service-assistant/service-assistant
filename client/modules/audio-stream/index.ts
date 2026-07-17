import { EventSubscription, requireOptionalNativeModule } from 'expo-modules-core';

type PcmAudio = {
	pcm: string;
	metering: number;
};

type AudioStreamError = {
	message: string;
};

type AudioStreamNativeModule = {
	startPcmStream?: () => Promise<void>;
	stopPcmStream?: () => Promise<void>;
	startPcmPlayback?: () => Promise<void>;
	enqueuePcmPlaybackChunk?: (chunkBase64: string) => Promise<void>;
	stopPcmPlayback?: () => Promise<void>;
	addListener(eventName: 'onPcmAudio', listener: (event: PcmAudio) => void): EventSubscription;
	addListener(
		eventName: 'onPcmStreamError',
		listener: (event: AudioStreamError) => void,
	): EventSubscription;
};

const nativeModule = requireOptionalNativeModule<AudioStreamNativeModule>('AudioStream');
const hasPcmAudioStream =
	typeof nativeModule?.startPcmStream === 'function' &&
	typeof nativeModule?.stopPcmStream === 'function';
const hasPcmAudioPlayback =
	typeof nativeModule?.startPcmPlayback === 'function' &&
	typeof nativeModule?.enqueuePcmPlaybackChunk === 'function' &&
	typeof nativeModule?.stopPcmPlayback === 'function';

export const isPcmAudioStreamAvailable = hasPcmAudioStream;
export const isPcmAudioPlaybackAvailable = hasPcmAudioPlayback;

export const startPcmAudioStream = () => nativeModule?.startPcmStream?.() ?? Promise.resolve();

export const stopPcmAudioStream = () => nativeModule?.stopPcmStream?.() ?? Promise.resolve();

export const startPcmAudioPlayback = () => nativeModule?.startPcmPlayback?.() ?? Promise.resolve();

export const enqueuePcmAudioPlaybackChunk = (chunkBase64: string) =>
	nativeModule?.enqueuePcmPlaybackChunk?.(chunkBase64) ?? Promise.resolve();

export const stopPcmAudioPlayback = () => nativeModule?.stopPcmPlayback?.() ?? Promise.resolve();

export const addPcmAudioListener = (listener: (event: PcmAudio) => void) =>
	hasPcmAudioStream && nativeModule
		? nativeModule.addListener('onPcmAudio', listener)
		: { remove: () => undefined };

export const addPcmStreamErrorListener = (listener: (event: AudioStreamError) => void) =>
	hasPcmAudioStream && nativeModule
		? nativeModule.addListener('onPcmStreamError', listener)
		: { remove: () => undefined };
