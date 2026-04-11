import React, { useState, useEffect, useRef } from 'react';
import {Text, TouchableOpacity, View, Image, ScrollView, ActivityIndicator, Switch, Platform} from 'react-native';
// 1. Importujemy rozpoznawanie mowy
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
// 2. Importujemy syntezator mowy (Text-to-Speech)
import * as Speech from 'expo-speech';
// 3. Importujemy moduł do odtwarzania audio
import {Audio, AVPlaybackStatus} from 'expo-av';
// 4. Importujemy system plików, żeby zapisać plik z OpenAI
import * as FileSystem from 'expo-file-system/legacy';

const SERVER_URL = 'http://localhost:8000';
// WPISZ TUTAJ SWÓJ KLUCZ API OPENAI



interface Message {
	id: number;
	sender: 'ai' | 'user';
	text: string;
}

export default function HomeScreen() {
	const [isListening, setIsListening] = useState<boolean>(false);
	const [recognizedText, setRecognizedText] = useState<string>('');
	const [isLoading, setIsLoading] = useState<boolean>(false);

	// Przełączniki systemów
	const [useChatGPT, setUseChatGPT] = useState<boolean>(false);
	const [useDeepgram, setUseDeepgram] = useState<boolean>(false);

	// Nagrywanie audio dla Deepgram
	const recordingRef = useRef<Audio.Recording | null>(null);

	// REFY DLA CISZY (Deepgram VAD)
	const lastLoudTime = useRef<number>(0);
	const hasSpoken = useRef<boolean>(false)
	const silenceThreshold = -50; // Próg głośności (decybele, np. -40 to cisza)
	const silenceDuration = 2500; // Ile ms ciszy przed wysłaniem?
	const initialSilenceDuration = 5000;

	// Typujemy Refy
	const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const currentTranscript = useRef<string>("");

	// Otypowane stany prawego panelu
	const [currentImage, setCurrentImage] = useState<string | null>(null);
	const [currentSource, setCurrentSource] = useState<string>('Oczekiwanie na zapytanie...');

	const initialMessage = 'Cześć. Jestem gotowy. Wybierz maszynę lub zadaj pytanie o naprawę.';
	const [messages, setMessages] = useState<Message[]>([
		{ id: 1, sender: 'ai', text: initialMessage }
	]);

	const hasAskedQuestion = messages.length > 1;
	// --- LOGIKA CHATGPT TTS ---
	const playChatGptAudio = async (text: string) => {
		try {
			const response = await fetch('https://api.openai.com/v1/audio/speech', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
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
				const { sound } = await Audio.Sound.createAsync(
					{ uri: url },
					{ shouldPlay: true }
				);
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
							{ shouldPlay: true }
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
			console.error("Błąd odtwarzania ChatGPT TTS:", error);
			Speech.speak(text, { language: 'pl-PL' });
		}
	};

	// --- EFEKTY ---
	useEffect(() => {
		Audio.setAudioModeAsync({
			playsInSilentModeIOS: true,
			staysActiveInBackground: false,
			shouldDuckAndroid: true,
			allowsRecordingIOS: true,
		});

		return () => { Speech.stop(); };
	}, []);

	// --- LOGIKA POŁĄCZENIA Z TWOIM API ---
	const askAPI = async (question: string) => {
		setIsLoading(true);

		if (!useChatGPT) {
			Speech.speak("Szukam w instrukcji...", { language: 'pl-PL', rate: 1.1 });
		}

		try {
			const response = await fetch(`${SERVER_URL}/ask`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pytanie: question })
			});

			if (!response.ok) throw new Error('Błąd sieci');

			const data = await response.json();

			setMessages(prev => [...prev, {
				id: Date.now(),
				sender: 'ai',
				text: data.odpowiedz
			}]);

			setCurrentSource(data.zrodlo !== 'Nieznany' ? data.zrodlo : 'Brak przypisanego działu');
			if (data.obrazki && data.obrazki.length > 0) {
				setCurrentImage(`${SERVER_URL}${data.obrazki[0]}`);
			} else {
				setCurrentImage(null);
			}

			if (useChatGPT) {
				playChatGptAudio(data.odpowiedz);
			} else {
				Speech.speak(data.odpowiedz, { language: 'pl-PL', pitch: 0.9, rate: 0.9 });
			}

		} catch (error) {
			console.error("Błąd API:", error);
			setMessages(prev => [...prev, { id: Date.now(), sender: 'ai', text: 'Przepraszam, nie mogłem połączyć się z serwerem.' }]);
			if (!useChatGPT) Speech.speak("Błąd połączenia z bazą danych.", { language: 'pl-PL' });
		} finally {
			setIsLoading(false);
		}
	};

	// --- POPRAWIONA WYSYŁKA DO DEEPGRAM ---
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
						'Authorization': `Token ${process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY}`,
						'Content-Type': 'audio/m4a',
					},
					body: audioBlob,
				}
			);

			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(`Deepgram Error ${response.status}: ${errorData}`);
			}

			const data = await response.json();
			const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

			if (transcript.trim().length > 0) {
				setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: transcript }]);
				askAPI(transcript);
			}
		} catch (error) {
			console.error('Błąd Deepgram:', error);
		} finally {
			setIsLoading(false);
		}
	};

	// --- FUNKCJA ZATRZYMUJĄCA I WYSYŁAJĄCA ---
	const stopRecordingAndSend = async () => {
		const recObj = recordingRef.current;
		if (!recObj) return; // Zabezpieczenie przed błędem "null" i podwójnym wywołaniem

		// Od razu czyścimy ref i stan, żeby callback od ciszy nie odpalił się drugi raz
		recordingRef.current = null;
		setIsListening(false);

		try {
			await recObj.stopAndUnloadAsync();
			const uri = recObj.getURI();
			if (uri) sendToDeepgram(uri);
		} catch (error) {
			console.error("Błąd podczas zatrzymywania:", error);
		}
	};

	// --- MONITOROWANIE CISZY ---
	// --- MONITOROWANIE CISZY ---
	const onRecordingStatusUpdate = (status: Audio.RecordingStatus) => {
		if (!status.canRecord || !status.isRecording) return;

		const now = Date.now();

		// Upewniamy się, że metering istnieje (czasami na ułamek sekundy jest undefined)
		if (status.metering !== undefined) {
			if (status.metering > silenceThreshold) {
				// Słyszymy dźwięk!
				lastLoudTime.current = now;
				hasSpoken.current = true; // Zaznaczamy, że padło pierwsze słowo
			} else {
				// Jest cicho
				if (hasSpoken.current) {
					// Użytkownik MÓWIŁ, ale przestał (sprawdzamy krótszy czas)
					if (now - lastLoudTime.current > silenceDuration) {
						console.log("Koniec mowy, wysyłam do Deepgram...");
						stopRecordingAndSend();
					}
				} else {
					// Użytkownik JESZCZE NIE ZACZĄŁ mówić (sprawdzamy dłuższy czas)
					if (now - lastLoudTime.current > initialSilenceDuration) {
						console.log("Zbyt długa cisza na start, wyłączam...");
						stopRecordingAndSend();
					}
				}
			}
		}
	};

	// --- HOOKI DO OBSŁUGI GŁOSU (ANDROID STT) ---
	useSpeechRecognitionEvent("start", () => setIsListening(true));

	useSpeechRecognitionEvent("end", () => {
		if (!useDeepgram) setIsListening(false);
		if (silenceTimer.current) clearTimeout(silenceTimer.current);
	});

	useSpeechRecognitionEvent("result", (event) => {
		if (useDeepgram) return; // Ignoruj jeśli używamy Deepgram

		if (event.results.length > 0) {
			let fullTranscript = "";
			for (const result of event.results) {
				fullTranscript += result.transcript + " ";
			}
			fullTranscript = fullTranscript.trim();

			setRecognizedText(fullTranscript);
			currentTranscript.current = fullTranscript;

			if (silenceTimer.current) clearTimeout(silenceTimer.current);

			silenceTimer.current = setTimeout(() => {
				if (currentTranscript.current.trim().length > 0) {
					const textToSend = currentTranscript.current;

					setRecognizedText('');
					currentTranscript.current = '';
					ExpoSpeechRecognitionModule.stop();

					setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: textToSend }]);
					askAPI(textToSend);
				}
			}, 2500);
		}
	});

	useSpeechRecognitionEvent("error", (event) => {
		console.log("Błąd rozpoznawania:", event.error);
		if (!useDeepgram) setIsListening(false);
		setRecognizedText('');
		if (silenceTimer.current) clearTimeout(silenceTimer.current);
	});

	// --- LOGIKA PRZYCISKU ---
	const handleMicPress = async () => {
		Speech.stop(); // Przerywamy mowę AI

		if (useDeepgram) {
			if (isListening && recordingRef.current) {
				await stopRecordingAndSend();
			} else {
				// Start nagrywania
				try {
					const { granted } = await Audio.requestPermissionsAsync();
					if (!granted) return;

					await Audio.setAudioModeAsync({
						allowsRecordingIOS: true,
						playsInSilentModeIOS: true,
					});

					// Zerujemy flagę ZANIM wystartujemy
					hasSpoken.current = false;

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
						100 // Sprawdzaj status co 100ms
					);

					// WAŻNE: Odpalamy timer DOPIERO jak mikrofon już fizycznie wystartuje!
					lastLoudTime.current = Date.now();
					recordingRef.current = newRecording;
					setIsListening(true);
				} catch (err) {
					console.error('Błąd startu nagrywania:', err);
				}
			}
		} else {
			if (isListening) {
				ExpoSpeechRecognitionModule.stop();
				if (silenceTimer.current) clearTimeout(silenceTimer.current);
				if (currentTranscript.current.trim().length > 0) {
					const textToSend = currentTranscript.current;
					setRecognizedText('');
					currentTranscript.current = '';
					setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: textToSend }]);
					askAPI(textToSend);
				}
			} else {
				setRecognizedText('');
				currentTranscript.current = '';

				const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
				if (!permission.granted) {
					console.warn("Brak uprawnień do mikrofonu lub rozpoznawania mowy!");
					return;
				}

				ExpoSpeechRecognitionModule.start({
					lang: 'pl-PL',
					interimResults: true,
					continuous: true
				});
			}
		}
	};

	// --- UI ---
	return (
		<View className="flex-1 flex-row bg-black">
			{/* Lewy panel */}
			<View className="w-[35%] bg-[#0f172a] border-r border-[#3B3C3E]">
				<View className="h-[60px] bg-[#18181B] justify-between items-center px-4 flex-row border-b border-[#334E68]">
					<View>
						<Text className="text-slate-300 font-bold tracking-widest text-xs">
							FLT ASYSTENT
						</Text>
						<View className="flex-row items-center mt-0.5">
							<View className="w-2 h-2 rounded-full bg-green-500 mr-1.5" />
							<Text className="text-green-500 font-bold tracking-widest text-[10px]">
								System Online
							</Text>
						</View>
					</View>

					{/* PRZEŁĄCZNIKI */}
					<View className="flex-col gap-1 items-end">
						{/* Przełącznik STT */}
						<View className="flex-row items-center gap-2">
							<Text className="text-slate-400 text-[9px] font-bold tracking-wider">
								{useDeepgram ? 'DEEPGRAM STT' : 'ANDROID STT'}
							</Text>
							<Switch
								value={useDeepgram}
								onValueChange={setUseDeepgram}
								trackColor={{ false: '#3E3E42', true: '#1A4E8A' }}
								thumbColor={useDeepgram ? '#60A5FA' : '#a3a3a3'}
								style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
							/>
						</View>
						{/* Przełącznik TTS */}
						<View className="flex-row items-center gap-2">
							<Text className="text-slate-400 text-[9px] font-bold tracking-wider">
								{useChatGPT ? 'CHATGPT TTS' : 'ANDROID TTS'}
							</Text>
							<Switch
								value={useChatGPT}
								onValueChange={setUseChatGPT}
								trackColor={{ false: '#3E3E42', true: '#1A4E8A' }}
								thumbColor={useChatGPT ? '#60A5FA' : '#a3a3a3'}
								style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
							/>
						</View>
					</View>
				</View>

				<View className="flex-1">
					<ScrollView className="h-[70%] w-full bg-[#0B1120] p-4">
						<View className="flex flex-col gap-5 pb-8">
							{messages.map((msg) => (
								msg.sender === 'ai' ? (
									<View key={msg.id} className="flex-row w-full gap-3 justify-start">
										<View className="w-8 h-8 rounded-full bg-[#E2E8F0] items-center justify-center mt-1">
											<Text className="text-slate-800 text-xs font-bold">AI</Text>
										</View>
										<View className="border border-slate-700/80 bg-[#0F172A] rounded-2xl px-4 py-3 max-w-[85%]">
											<Text className="text-slate-200 text-[15px] leading-6">
												{msg.text}
											</Text>
										</View>
									</View>
								) : (
									<View key={msg.id} className="flex-row w-full gap-3 justify-end">
										<View className="bg-[#24548E] rounded-2xl px-4 py-3 max-w-[85%]">
											<Text className="text-white text-[15px] leading-6">
												{msg.text}
											</Text>
										</View>
										<View className="w-8 h-8 rounded-full border border-slate-500 bg-[#1E293B] items-center justify-center mt-1">
											<Text className="text-slate-300 text-xs font-bold">TY</Text>
										</View>
									</View>
								)
							))}

							{isLoading && (
								<View className="flex-row w-full gap-3 justify-start opacity-70 mt-2">
									<View className="w-8 h-8 rounded-full bg-[#E2E8F0] items-center justify-center">
										<ActivityIndicator size="small" color="#0F172A" />
									</View>
									<Text className="text-slate-400 text-xs self-center">Analiza danych...</Text>
								</View>
							)}

							{(isListening || recognizedText.length > 0) && (
								<View className="flex-row w-full gap-3 justify-end opacity-80">
									<View className="bg-[#1A4E8A] border border-[#3b82f6] rounded-2xl px-4 py-3 max-w-[85%]">
										<Text className="text-white text-[15px] leading-6 italic">
											{recognizedText || (useDeepgram ? 'Nagrywam...' : 'Słucham...')}
										</Text>
									</View>
									<View className="w-8 h-8 rounded-full border border-slate-500 bg-[#1E293B] items-center justify-center mt-1">
										<Text className="text-slate-300 text-xs font-bold">TY</Text>
									</View>
								</View>
							)}
						</View>
					</ScrollView>

					<View className="h-[30%] w-full justify-center items-center bg-[#18181B] border-t border-[#334E68] z-10">
						<Text className="text-[#8C8989] text-xs font-semibold tracking-widest mb-4">
							{isListening ? (useDeepgram ? "NAGRYWANIE (MÓW LUB TAPNIJ BY WYSŁAĆ)" : "NASŁUCHIWANIE...") : "NACIŚNIJ, ABY ZADAĆ PYTANIE"}
						</Text>

						<TouchableOpacity
							onPress={handleMicPress}
							activeOpacity={0.6}
							disabled={isLoading}
							className={`w-[84px] h-[84px] rounded-full border-[3px] justify-center items-center ${
								isListening ? 'bg-red-600 border-red-400' : 'bg-[#1A4E8A] border-slate-200'
							} ${isLoading ? 'opacity-50' : ''}`}
						>
							<Image
								source={require('../../assets/images/micro.png')}
								style={{ width: 50, height: 50 }}
								resizeMode="contain"
							/>
						</TouchableOpacity>

						{/* NOWY NAPIS DODANY TUTAJ */}
						{!isListening && (
							<Text className="text-[#8C8989] text-xs font-medium tracking-wider mt-4 uppercase">
								lub powiedz "start"
							</Text>
						)}
					</View>
				</View>
			</View>

			{/* Prawy panel - dokumentacja */}
			{/* Prawy panel - dokumentacja */}
			<View className="w-[65%] bg-[#0a0a0a]">
				<View className="h-[60px] bg-[#18181B] flex-row items-center justify-center px-6 border-b border-neutral-800">
					<View className="bg-orange-600 px-2 py-0.5 rounded mr-3">
						<Text className="text-white text-xs font-bold tracking-wider">
							ŹRÓDŁO
						</Text>
					</View>
					<Text className="text-neutral-300 font-medium mr-3">
						{/* Na starcie możemy też podmienić tekst na "Dokumentacja początkowa" */}
						{!hasAskedQuestion ? 'Dokumentacja PDF' : currentSource}
					</Text>
				</View>

				<View className="flex-1 items-center justify-center p-4">
					{!hasAskedQuestion ? (
						// Wrapper ukrywający wychodzące poza ekran krawędzie iframe'a
						<View className="w-full h-full overflow-hidden bg-[#09090B] ">
							<iframe
								src={`${require('../../assets/instrukcje.pdf')}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
								style={{
									width: '104%',      // Rozszerzamy iframe poza kontener
									height: '104%',     // Rozszerzamy iframe poza kontener
									marginLeft: '-2%',  // Przesuwamy go w lewo, aby wyśrodkować
									marginTop: '-2%',   // Przesuwamy go w górę
									border: 'none',
									filter: 'grayscale(100%) invert(96.5%) brightness(0.9)'
								}}
								title="Instrukcja PDF"
							/>
						</View>
					) : currentImage ? (
						<img
							src={currentImage}
							style={{
								width: '100%',
								height: '100%',
								objectFit: 'contain',
								filter: 'grayscale(100%) invert(96.5%) brightness(1.04)'
							}}
							alt="Schemat"
						/>
					) : (
						<Text className="text-neutral-600">
							{isLoading ? "Wyszukiwanie schematu..." : "Brak schematu do wyświetlenia dla tego zapytania."}
						</Text>
					)}
				</View>
		</View>
		</View>
	);
}

//Zgodnie z instrukcją demontażu (dismantling) w ramach wymiany łożysk dla electric pump motor 1710, od jakich dwóch
// elementów należy rozpocząć jego rozbieranie i jakimi numerami są one oznaczone na rysunku technicznym?