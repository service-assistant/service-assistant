import React, { useState } from 'react';
import { Text, TouchableOpacity, View, Image } from 'react-native';

export default function HomeScreen() {
	const [step, setStep] = useState(1);

	const handleMicPress = () => {
		console.log("Kliknięto mikrofon! Obecny krok:", step);

		if (step === 1) {
			setStep(2);
			setTimeout(() => {
				setStep(3);
			}, 1000);
		} else if (step === 3) {
			setStep(4);
			setTimeout(() => {
				setStep(5);
			}, 1500);
		}
	};

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
					<View className="h-[75%] w-full bg-[#0B1120] p-4 flex flex-col gap-5">

						{/* Wiadomość 1: Asystent (Krok 1) */}
						{step >= 1 && (
							<View className="flex-row w-full gap-3 justify-start">
								<View className="w-8 h-8 rounded-full bg-[#E2E8F0] items-center justify-center mt-1">
									<Text className="text-slate-800 text-xs font-bold">AI</Text>
								</View>
								<View className="border border-slate-700/80 bg-[#0F172A] rounded-2xl px-4 py-3 max-w-[85%]">
									<Text className="text-slate-200 text-[15px] leading-6">
										Cześć. Jestem gotowy. Wybierz maszynę lub zadaj pytanie o naprawę.
									</Text>
								</View>
							</View>
						)}

						{/* Wiadomość 2: Użytkownik (Krok 2) */}
						{step >= 2 && (
							<View className="flex-row w-full gap-3 justify-end">
								<View className="bg-[#24548E] rounded-2xl px-4 py-3 max-w-[85%]">
									<Text className="text-white text-[15px] leading-6">
										Asystent, otwórz instrukcję pompy H-200.
									</Text>
								</View>
								<View className="w-8 h-8 rounded-full border border-slate-500 bg-[#1E293B] items-center justify-center mt-1">
									<Text className="text-slate-300 text-xs font-bold">TY</Text>
								</View>
							</View>
						)}

						{/* Wiadomość 3: Asystent (Krok 3) */}
						{step >= 3 && (
							<View className="flex-row w-full gap-3 justify-start">
								<View className="w-8 h-8 rounded-full bg-[#E2E8F0] items-center justify-center mt-1">
									<Text className="text-slate-800 text-xs font-bold">AI</Text>
								</View>
								<View className="border border-slate-700/80 bg-[#0F172A] rounded-2xl px-4 py-3 max-w-[85%]">
									<Text className="text-slate-200 text-[15px] leading-6">
										Instrukcja pompy H-200 załadowana.
									</Text>
								</View>
							</View>
						)}

						{/* Wiadomość 4: Użytkownik (Krok 4) */}
						{step >= 4 && (
							<View className="flex-row w-full gap-3 justify-end">
								<View className="bg-[#24548E] rounded-2xl px-4 py-3 max-w-[85%]">
									<Text className="text-white text-[15px] leading-6">
										Mam spadek ciśnienia poniżej 100 barów przy pełnym obciążeniu. Co może być przyczyną?
									</Text>
								</View>
								<View className="w-8 h-8 rounded-full border border-slate-500 bg-[#1E293B] items-center justify-center mt-1">
									<Text className="text-slate-300 text-xs font-bold">TY</Text>
								</View>
							</View>
						)}

						{/* Wiadomość 5: Asystent (Krok 5) */}
						{step >= 5 && (
							<View className="flex-row w-full gap-3 justify-start">
								<View className="w-8 h-8 rounded-full bg-[#E2E8F0] items-center justify-center mt-1">
									<Text className="text-slate-800 text-xs font-bold">AI</Text>
								</View>
								<View className="border border-slate-700/80 bg-[#0F172A] rounded-2xl px-4 py-4 max-w-[85%]">
									<Text className="text-slate-200 text-[15px] leading-6 mb-2">
										Według sekcji "Rozwiązywanie problemów" (str. 34), najczęstsze przyczyny to:
									</Text>
									<View className="space-y-1">
										<Text className="text-slate-200 text-[15px]">1. Zanieczyszczony filtr ssawny.</Text>
										<Text className="text-slate-200 text-[15px]">2. Uszkodzony zawór przelewowy V2.</Text>
										<Text className="text-slate-200 text-[15px]">3. Wyciek wewnętrzny.</Text>
									</View>
								</View>
							</View>
						)}

					</View>

					{/* Panel z mikrofonem */}
					<View className="h-[25%] w-full justify-center items-center bg-[#1C1C1E] border-t border-[#334E68] z-10">
						<Text className="text-[#8C8989] text-xs font-semibold tracking-widest mb-4">
							{step >= 5 ? "KONWERSACJA ZAKOŃCZONA" : "NACIŚNIJ, ABY ZADAĆ PYTANIE"}
						</Text>

						<TouchableOpacity
							onPress={handleMicPress}
							activeOpacity={0.6}
							className="w-[84px] h-[84px] bg-[#1A4E8A] rounded-full border-[3px] border-slate-200 justify-center items-center"
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