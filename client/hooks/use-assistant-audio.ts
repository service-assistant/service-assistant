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

type UseAssistantAudioParams = {
	setIsLoading: Dispatch<SetStateAction<boolean>>;
	setIsGenerating: Dispatch<SetStateAction<boolean>>;
};

export const useAssistantAudio = ({ setIsLoading, setIsGenerating }: UseAssistantAudioParams) => {
	const ttsPlayer = useAudioPlayer(null);
	const ttsAbortControllerRef = useRef<AbortController | null>(null);
	const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

	useEffect(() => {
		const interval = setInterval(() => {
			if (ttsPlayer && ttsPlayer.playing) {
				setIsAudioPlaying(true);
			} else {
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
		if (ttsPlayer && ttsPlayer.playing) {
			ttsPlayer.pause();
		}
		setIsAudioPlaying(false);
	}, [ttsPlayer]);

	useEffect(() => () => stopAssistantAudio(), [stopAssistantAudio]);

	const playAssistantAudio = useCallback(
		async (text: string) => {
			const abortController = new AbortController();
			ttsAbortControllerRef.current = abortController;

			try {
				setIsLoading(true);
				const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

				if (!apiKey) {
					alert('Missing API Key!');
					return;
				}

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

				if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
				if (abortController.signal.aborted) return;

				if (Platform.OS === 'web') {
					const blob = await response.blob();
					if (abortController.signal.aborted) return;

					const url = URL.createObjectURL(blob);
					ttsPlayer.replace(url);
					setIsAudioPlaying(true);
					ttsPlayer.play();
				} else {
					const arrayBuffer = await response.arrayBuffer();
					if (abortController.signal.aborted) return;

					const base64data = Buffer.from(arrayBuffer).toString('base64');
					const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';

					await FileSystem.writeAsStringAsync(fileUri, base64data, {
						encoding: FileSystem.EncodingType.Base64,
					});

					if (abortController.signal.aborted) return;

					ttsPlayer.replace(fileUri);
					setIsAudioPlaying(true);
					ttsPlayer.play();
				}
			} catch (error: any) {
				if (error.name === 'AbortError') return;
				console.error('ChatGPT TTS error:', error);
			} finally {
				setIsLoading(false);
				setIsGenerating(false);
				if (ttsAbortControllerRef.current === abortController) {
					ttsAbortControllerRef.current = null;
				}
			}
		},
		[setIsGenerating, setIsLoading, ttsPlayer],
	);

	return {
		isAudioPlaying,
		playAssistantAudio,
		stopAssistantAudio,
	};
};
