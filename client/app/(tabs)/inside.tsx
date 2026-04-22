import React, { useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Image,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';

// Odtwarzanie i nagrywanie audio
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';

import RightPanel from "@/components/RightPanel";
import {useRouter} from "expo-router";

const SERVER_URL = 'http://10.0.2.2:8000';
// EXPO_PUBLIC_OPENAI_API_KEY
// EXPO_PUBLIC_DEEPGRAM_API_KEY

interface Message {
	id: number;
	sender: 'ai' | 'user';
	text: string;
}

export default function HomeScreen() {
	const router = useRouter();
	const [showSchema, setShowSchema] = useState<boolean>(true);
	const [selectedPdf, setSelectedPdf] = useState<any>(null);
	const [isListening, setIsListening] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(false);

	const recordingRef = useRef<Audio.Recording | null>(null);

	const lastLoudTime = useRef<number>(0);
	const hasSpoken = useRef<boolean>(false);
	const silenceThreshold = -50;
	const silenceDuration = 2500;
	const initialSilenceDuration = 5000;

	const [currentImage, setCurrentImage] = useState<string | null>(null);
	const [currentSource, setCurrentSource] = useState<string>('02-8FGF15');

	const initialMessage = 'Cześć. Jestem gotowy. Wybierz maszynę lub zadaj pytanie o naprawę.';
	const [messages, setMessages] = useState<Message[]>([
		{ id: 1, sender: 'ai', text: initialMessage },
	]);

	const playChatGptAudio = async (text: string) => {
		try {
			const response = await fetch('https://api.openai.com/v1/audio/speech', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'tts-1',
					input: text,
					voice: 'alloy',
				}),
			});

			if (!response.ok) throw new Error('Błąd połączenia z API OpenAI');

			const blob = await response.blob();

			if (Platform.OS === 'web') {
				const url = URL.createObjectURL(blob);
				const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
				sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
					if (status.isLoaded && status.didJustFinish) {
						sound.unloadAsync();
						URL.revokeObjectURL(url);
					}
				});
			} else {
				const reader = new FileReader();
				reader.onload = async () => {
					if (typeof reader.result === 'string') {
						const base64data = reader.result.split(',')[1];
						const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';
						await FileSystem.writeAsStringAsync(fileUri, base64data, {
							encoding: 'base64',
						});

						const { sound } = await Audio.Sound.createAsync(
							{ uri: fileUri },
							{ shouldPlay: true },
						);
						sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
							if (status.isLoaded && status.didJustFinish) {
								sound.unloadAsync();
							}
						});
					}
				};
				reader.readAsDataURL(blob);
			}
		} catch (error) {
			console.error('Błąd odtwarzania ChatGPT TTS:', error);
		}
	};

	useEffect(() => {
		Audio.setAudioModeAsync({
			playsInSilentModeIOS: true,
			staysActiveInBackground: false,
			shouldDuckAndroid: true,
			allowsRecordingIOS: true,
		});
	}, []);

	useEffect(() => {
		if (currentImage) setShowSchema(true);
	}, [currentImage]);

	const askAPI = async (question: string) => {
		setIsLoading(true);

		try {
			const response = await fetch(`${SERVER_URL}/ask`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pytanie: question }),
			});

			if (!response.ok) throw new Error('Błąd sieci');

			const data = await response.json();

			setMessages((prev) => [
				...prev,
				{ id: Date.now(), sender: 'ai', text: data.odpowiedz },
			]);

			setCurrentSource(data.zrodlo !== 'Nieznany' ? data.zrodlo : '02-8FGF15');
			if (data.obrazki && data.obrazki.length > 0) {
				setCurrentImage(`${SERVER_URL}${data.obrazki[0]}`);
			} else {
				setCurrentImage(null);
			}

			playChatGptAudio(data.odpowiedz);
		} catch (error) {
			console.error('Błąd API:', error);
			const errorMsg = 'Przepraszam, nie mogłem połączyć się z serwerem.';
			setMessages((prev) => [
				...prev,
				{ id: Date.now(), sender: 'ai', text: errorMsg },
			]);
			playChatGptAudio(errorMsg);
		} finally {
			setIsLoading(false);
		}
	};

	const sendToDeepgram = async (uri: string) => {
		setIsLoading(true);
		try {
			const responseFile = await fetch(uri);
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
				},
			);

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`Deepgram Error ${response.status}: ${errorData}`);
			}

			const data = await response.json();
			const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

			if (transcript.trim().length > 0) {
				setMessages((prev) => [
					...prev,
					{ id: Date.now(), sender: 'user', text: transcript },
				]);
				askAPI(transcript);
			}
		} catch (error) {
			console.error('Błąd Deepgram:', error);
		} finally {
			setIsLoading(false);
		}
	};

	const stopRecordingAndSend = async () => {
		const recObj = recordingRef.current;
		if (!recObj) return;

		recordingRef.current = null;
		setIsListening(false);

		try {
			await recObj.stopAndUnloadAsync();
			const uri = recObj.getURI();
			if (uri) sendToDeepgram(uri);
		} catch (error) {
			console.error('Błąd podczas zatrzymywania:', error);
		}
	};

	const onRecordingStatusUpdate = (status: Audio.RecordingStatus) => {
		if (!status.canRecord || !status.isRecording) return;
		const now = Date.now();

		if (status.metering !== undefined) {
			if (status.metering > silenceThreshold) {
				lastLoudTime.current = now;
				hasSpoken.current = true;
			} else {
				if (hasSpoken.current) {
					if (now - lastLoudTime.current > silenceDuration) {
						stopRecordingAndSend();
					}
				} else {
					if (now - lastLoudTime.current > initialSilenceDuration) {
						stopRecordingAndSend();
					}
				}
			}
		}
	};

	const handleMicPress = async () => {
		if (isListening) {
			// Zgaszenie guzika natychmiast przy wyłączaniu
			setIsListening(false);
			await stopRecordingAndSend();
		} else {
			// 1. NATYCHMIASTOWA REAKCJA UI
			setIsListening(true);

			// 2. WYMUSZAMY RENDEROWANIE EKRANU
			setTimeout(async () => {
				try {
					// Sprawdzenie uprawnień
					const { granted } = await Audio.requestPermissionsAsync();
					if (!granted) {
						setIsListening(false);
						return;
					}

					hasSpoken.current = false;

					// Włączanie sprzętu zaczyna się DOPIERO gdy guzik już świeci
					const { recording: newRecording } = await Audio.Recording.createAsync(
						{
							...Audio.RecordingOptionsPresets.HIGH_QUALITY,
							android: {
								...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
								// @ts-ignore
								isMeteringEnabled: true,
							},
							ios: {
								...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
								isMeteringEnabled: true,
							},
						},
						onRecordingStatusUpdate,
						100,
					);

					lastLoudTime.current = Date.now();
					recordingRef.current = newRecording;

				} catch (err) {
					console.error('Błąd startu nagrywania:', err);
					setIsListening(false);
				}
			}, 50);
		}
	};

	return (
		<View className='flex-1 flex-row bg-black p-4'>

			{/* LEWY PANEL (Pływający Chat) */}
			<View className='w-[32%] h-full flex flex-col'>

				{/* ZMIANA: Przycisk WSTECZ, separator, logo i model */}
				<View className='w-full h-14 mb-4 flex-row items-center'>
					<TouchableOpacity className='flex-row items-center border border-[#CC5500] px-4 py-3 rounded-md bg-[#0a0a0a]' onPress={() => router.push('/home')}>
						<Feather name="arrow-left" size={18} color="#CC5500" />
						<Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>WSTECZ</Text>
					</TouchableOpacity>

					{/* Separator */}
					<Text className='text-neutral-600 mx-4 text-xl'>|</Text>

					{/* Logo Toyota */}
					<Image
						source={require('../../assets/images/toyota.png')}
						style={{ width: 70, height: 20 }}
						resizeMode="contain"
					/>

					{/* Numer modelu */}
					<Text className='text-slate-200 font-bold ml-4 tracking-widest text-sm uppercase'>
						02-8FGF15
					</Text>
				</View>

				<View className='flex-1 border border-[#CC5500] rounded-2xl bg-[#09090B] flex-col overflow-hidden'>
					<View className='p-4 border-b border-neutral-800 flex-row items-center'>
						<View className='w-15 h-15 rounded-md border border-[#CC5500] items-center justify-center mr-3'>
							{/* ZMIANA: Zastąpienie wektorowej ikony robota obrazkiem */}
							<Image
								source={require('../../assets/images/robot.png')}
								style={{ width: 40, height: 40, tintColor: '#CC5500' }}
								resizeMode="contain"
							/>
						</View>
						<View>
							<Text className='text-slate-200 font-bold tracking-widest text-xs'>FLT ASYSTENT</Text>
							<View className='flex-row items-center mt-1'>
								<View className='w-2 h-2 rounded-full bg-green-500 mr-1.5' />
								<Text className='text-green-500 font-bold tracking-widest text-[10px]'>System Online</Text>
							</View>
						</View>
					</View>

					<ScrollView className='flex-1 p-4'>
						<View className='flex flex-col gap-4 pb-4'>
							{messages.map((msg) =>
								msg.sender === 'ai' ? (
									<View key={msg.id} className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-4 py-3 self-start max-w-[90%]'>
										<Text className='text-slate-300 text-[14px] leading-5'>{msg.text}</Text>
									</View>
								) : (
									<View key={msg.id} className='bg-[#A64D00] rounded-2xl rounded-tr-sm px-4 py-3 self-end max-w-[90%]'>
										<Text className='text-white text-[14px] leading-5'>{msg.text}</Text>
									</View>
								),
							)}

							{isLoading && (
								<View className='bg-[#1E1E22] rounded-2xl px-4 py-3 self-start flex-row items-center'>
									<ActivityIndicator size='small' color='#CC5500' />
									<Text className='text-slate-400 text-xs ml-3'>Przetwarzanie...</Text>
								</View>
							)}
						</View>
					</ScrollView>

					{/* --- 3 GUZIKI + TEKST --- */}
					<View className='w-full px-4 py-6 flex-row justify-center items-center gap-6 border-t border-neutral-900'>

						{/* Aparat (72px) */}
						<TouchableOpacity className='w-[72px] h-[72px] bg-[#121212] border border-black rounded-[12px] items-center justify-center'>
							<Image
								source={require('../../assets/images/camera.png')}
								style={{ width: 32, height: 32, tintColor: '#A3A3A3' }}
								resizeMode="contain"
							/>
						</TouchableOpacity>

						{/* Mikrofon (112px) + Tekst informacyjny */}
						<View className='items-center flex-col gap-3'>
							<TouchableOpacity
								onPressIn={handleMicPress}
								className={`w-[112px] h-[112px] rounded-[12px] items-center justify-center ${
									isListening ? 'bg-[#2A1100] border-2 border-[#FF6600]' : 'bg-[#121212] border border-black'
								}`}
							>
								<Image
									source={require('../../assets/images/micro.png')}
									style={{ width: 56, height: 56, tintColor: isListening ? '#FF6600' : '#A3A3A3' }}
									resizeMode="contain"
								/>
							</TouchableOpacity>
							<Text className={`text-[10px] font-bold tracking-widest ${isListening ? 'text-[#FF6600]' : 'text-[#A3A3A3]'}`}>
								{isListening ? 'SŁUCHAM...' : 'NACIŚNIJ ŻEBY MÓWIĆ'}
							</Text>
						</View>

						{/* Lupa (72px) */}
						<TouchableOpacity className='w-[72px] h-[72px] bg-[#121212] border border-black rounded-[12px] items-center justify-center'>
							<Image
								source={require('../../assets/images/search.png')}
								style={{ width: 32, height: 32, tintColor: '#A3A3A3' }}
								resizeMode="contain"
							/>
						</TouchableOpacity>

					</View>
				</View>
			</View>

			{/* PRAWY PANEL */}
			<RightPanel
				currentSource={currentSource}
				hasAskedQuestion={messages.length > 1}
				currentImage={currentImage}
				isLoading={isLoading}
				isListening={isListening}
				onMicPress={handleMicPress}
				selectedPdf={selectedPdf}
				showSchema={showSchema}
				setShowSchema={setShowSchema}
				onSelectPdf={(pdf: any) => {
					setSelectedPdf(pdf);
					setShowSchema(false);
				}}
				setCurrentImage={setCurrentImage}
			/>
		</View>
	);
}