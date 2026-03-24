import React, { useState } from 'react';
import { Text, TouchableOpacity, View, Image, ScrollView } from 'react-native';
// 1. Importujemy nową bibliotekę
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

export default function HomeScreen() {
	const [isListening, setIsListening] = useState(false);
	const [recognizedText, setRecognizedText] = useState('');
	const [messages, setMessages] = useState([
		{ id: 1, sender: 'ai', text: 'Cześć. Jestem gotowy. Wybierz maszynę lub zadaj pytanie o naprawę.' }
	]);

	// --- HOOKI DO OBSŁUGI GŁOSU ---

	// Odpalane, gdy mikrofon zaczyna nasłuchiwać
	useSpeechRecognitionEvent("start", () => setIsListening(true));

	// Odpalane, gdy mikrofon zostaje wyłączony
	useSpeechRecognitionEvent("end", () => setIsListening(false));

	// Odpalane, gdy biblioteka przetworzy jakiś tekst (zarówno na żywo, jak i finalny)
	useSpeechRecognitionEvent("result", (event) => {
		if (event.results.length > 0) {
			// Pobieramy rozpoznany tekst
			const transcript = event.results[0].transcript;

			if (event.isFinal) {
				// UŻYTKOWNIK SKOŃCZYŁ MÓWIĆ (Ostateczny wynik)
				setRecognizedText(''); // Czyścimy dymek podglądu

				// Dodajemy wiadomość do czatu
				setMessages(prev => [...prev, { id: Date.now(), sender: 'user', text: transcript }]);

				// Symulacja odpowiedzi AI
				setTimeout(() => {
					setMessages(prev => [...prev, {
						id: Date.now() + 1,
						sender: 'ai',
						text: `Zrozumiałem. Przeszukuję dokumentację dla hasła: "${transcript}"...`
					}]);
				}, 1000);
			} else {
				// UŻYTKOWNIK WCIĄŻ MÓWI (Podgląd na żywo)
				setRecognizedText(transcript);
			}
		}
	});

	// Obsługa ewentualnych błędów
	useSpeechRecognitionEvent("error", (event) => {
		console.log("Błąd rozpoznawania:", event.error);
		setIsListening(false);
		setRecognizedText('');
	});

	// --- LOGIKA PRZYCISKU ---

	const handleMicPress = async () => {
		if (isListening) {
			// Zatrzymujemy nasłuch
			ExpoSpeechRecognitionModule.stop();
		} else {
			setRecognizedText('');

			// Przed włączeniem mikrofonu, upewniamy się, że mamy uprawnienia
			const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
			if (!permission.granted) {
				console.warn("Brak uprawnień do mikrofonu lub rozpoznawania mowy!");
				return;
			}

			// Odpalamy nasłuch
			ExpoSpeechRecognitionModule.start({
				lang: 'pl-PL',
				interimResults: true, // Wymagane, aby widzieć tekst "na żywo" w dymku
				continuous: false     // Mikrofon sam się wyłączy po jednym zdaniu
			});
		}
	};

	// --- UI (Bez zmian, zostało Twoje świetne formatowanie w Tailwind/NativeWind) ---
	return (
		<View className="flex-1 flex-row bg-black">
			{/* Lewy panel */}
			<View className="w-[35%] bg-[#0f172a] border-r border-[#3B3C3E]">
				<View className="h-[50px] bg-[#1C1C1E] justify-center items-center border-b border-[#334E68]">
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

				<View className="flex-1">
					<ScrollView className="h-[75%] w-full bg-[#0B1120] p-4">
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

							{(isListening || recognizedText.length > 0) && (
								<View className="flex-row w-full gap-3 justify-end opacity-80">
									<View className="bg-[#1A4E8A] border border-[#3b82f6] rounded-2xl px-4 py-3 max-w-[85%]">
										<Text className="text-white text-[15px] leading-6 italic">
											{recognizedText || 'Słucham...'}
										</Text>
									</View>
									<View className="w-8 h-8 rounded-full border border-slate-500 bg-[#1E293B] items-center justify-center mt-1">
										<Text className="text-slate-300 text-xs font-bold">TY</Text>
									</View>
								</View>
							)}
						</View>
					</ScrollView>

					<View className="h-[25%] w-full justify-center items-center bg-[#1C1C1E] border-t border-[#334E68] z-10">
						<Text className="text-[#8C8989] text-xs font-semibold tracking-widest mb-4">
							{isListening ? "NASŁUCHIWANIE..." : "NACIŚNIJ, ABY ZADAĆ PYTANIE"}
						</Text>

						<TouchableOpacity
							onPress={handleMicPress}
							activeOpacity={0.6}
							className={`w-[84px] h-[84px] rounded-full border-[3px] justify-center items-center ${
								isListening ? 'bg-red-600 border-red-400' : 'bg-[#1A4E8A] border-slate-200'
							}`}
						>
							<Image
								source={require('../../assets/images/micro.png')}
								style={{ width: 40, height: 40 }}
								resizeMode="contain"
							/>
						</TouchableOpacity>

						<Text className="text-[#8C8989] text-xs font-semibold tracking-widest mt-4">
							LUB POWIEDZ "START"
						</Text>
					</View>
				</View>
			</View>

			{/* Prawy panel - dokumentacja */}
			<View className="w-[65%] bg-[#0a0a0a]">
				<View className="h-[50px] bg-[#1C1C1E] flex-row items-center justify-center px-6 border-b border-neutral-800">
					<View className="bg-orange-600 px-2 py-0.5 rounded mr-3">
						<Text className="text-white text-xs font-bold tracking-wider">
							MANUAL
						</Text>
					</View>
					<Text className="text-neutral-300 font-medium mr-3">
						Pompa Hydrauliczna H-200
					</Text>
					<Text className="text-neutral-600 text-xs">
						Strona 14/42
					</Text>
				</View>
				<View className="flex-1 items-center justify-center">
					<Text className="text-neutral-600">
						Miejsce na schemat...
					</Text>
				</View>
			</View>
		</View>
	);
}