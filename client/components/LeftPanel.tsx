import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
	Animated,
	Easing,
	Image,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';

export interface Message {
	id: number;
	sender: 'ai' | 'user';
	text: string;
	isSpeaking?: boolean;
}

interface LeftPanelProps {
	messages: Message[];
	isLoading: boolean;
	isListening: boolean;
	onMicPress: () => void;
	soundLevelAnim: Animated.Value;
	showTextInput: boolean;
	setShowTextInput: (show: boolean) => void;
	inputText: string;
	setInputText: (text: string) => void;
	onSendText: () => void;
	currentSource: string;
	isGenerating: boolean;
	onStop: () => void;
}

const SoundWaveformIndicator = ({ soundLevel }: { soundLevel: Animated.Value }) => {
	const bars = Array.from({ length: 8 }, (_, i) => i);

	return (
		<View className='flex-row items-center justify-center min-h-[20px] gap-[3px]'>
			{bars.map((i) => (
				<Animated.View
					key={i}
					className='w-[3px] bg-white rounded-[1.5px]'
					style={{
						transform: [{ scaleY: soundLevel }],
						opacity: soundLevel.interpolate({
							inputRange: [0.2, 1.5],
							outputRange: [0.4, 1],
							extrapolate: 'clamp',
						}),
						height: 16 - Math.abs(i - 3.5) * 2,
					}}
				/>
			))}
		</View>
	);
};

const BotTypingAnimation = () => {
	const dot1 = useRef(new Animated.Value(0)).current;
	const dot2 = useRef(new Animated.Value(0)).current;
	const dot3 = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animateDot = (v: Animated.Value, delay: number) => {
			return Animated.loop(
				Animated.sequence([
					Animated.delay(delay),
					Animated.timing(v, {
						toValue: -6,
						duration: 400,
						easing: Easing.bezier(0.4, 0, 0.6, 1),
						useNativeDriver: true,
					}),
					Animated.timing(v, {
						toValue: 0,
						duration: 400,
						easing: Easing.bezier(0.4, 0, 0.6, 1),
						useNativeDriver: true,
					}),
				]),
			);
		};

		const animation = Animated.parallel([
			animateDot(dot1, 0),
			animateDot(dot2, 200),
			animateDot(dot3, 400),
		]);

		animation.start();
		return () => animation.stop();
	}, [dot1, dot2, dot3]);

	return (
		<View className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-5 py-4 self-start flex-row items-center'>
			{[dot1, dot2, dot3].map((v, i) => (
				<Animated.View
					key={i}
					style={{ transform: [{ translateY: v }] }}
					className='w-1.5 h-1.5 bg-[#CC5500] rounded-full mx-0.5'
				/>
			))}
			<Text className='text-slate-400 text-[10px] ml-3 font-bold tracking-widest uppercase'>
				Przetwarzanie...
			</Text>
		</View>
	);
};

const ListeningPulse = () => {
	const scale = useRef(new Animated.Value(1)).current;
	const opacity = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		Animated.loop(
			Animated.parallel([
				Animated.timing(scale, {
					toValue: 1.5,
					duration: 1000,
					useNativeDriver: true,
				}),
				Animated.timing(opacity, {
					toValue: 0,
					duration: 1000,
					useNativeDriver: true,
				}),
			]),
		).start();
	}, [scale, opacity]);

	return (
		<Animated.View
			style={{ transform: [{ scale }], opacity }}
			className='absolute w-full h-full rounded-[12px] border-2 border-[#FF6600]'
		/>
	);
};

export default function LeftPanel({
	messages,
	isLoading,
	isListening,
	onMicPress,
	soundLevelAnim,
	showTextInput,
	setShowTextInput,
	inputText,
	setInputText,
	onSendText,
	currentSource,
	isGenerating,
	onStop,
}: LeftPanelProps) {
	const scrollViewRef = useRef<ScrollView>(null);
	const router = useRouter();

	return (
		<View className='w-[32%] h-full flex flex-col'>
			<View className='w-full h-14 mb-4 flex-row items-center'>
				<TouchableOpacity
					className='flex-row items-center border border-[#CC5500] px-4 py-3 rounded-md bg-[#0a0a0a]'
					onPress={() => router.push('/home')}>
					<Feather name='arrow-left' size={18} color='#CC5500' />
					<Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>
						WSTECZ
					</Text>
				</TouchableOpacity>

				<Text className='text-neutral-600 mx-4 text-xl'>|</Text>

				<Image
					source={require('../assets/images/toyota.png')}
					style={{ width: 70, height: 20 }}
					resizeMode='contain'
				/>

				<Text className='text-slate-200 font-bold ml-4 tracking-widest text-sm uppercase'>
					{currentSource}
				</Text>
			</View>

			<View className='flex-1 border border-[#CC5500] rounded-2xl bg-[#09090B] flex-col overflow-hidden shadow-2xl relative'>
				<View className='p-4 border-b border-neutral-800 flex-row items-center bg-[#0d0d0f]'>
					<View className='w-12 h-12 rounded-md border border-[#CC5500] items-center justify-center mr-3'>
						<Image
							source={require('../assets/images/robot.png')}
							style={{ width: 32, height: 32, tintColor: '#CC5500' }}
							resizeMode='contain'
						/>
					</View>
					<View>
						<Text className='text-slate-200 font-bold tracking-widest text-xs'>
							FIXO ASYSTENT
						</Text>
						<View className='flex-row items-center mt-1'>
							<View className='w-2 h-2 rounded-full bg-green-500 mr-1.5' />
							<Text className='text-green-500 font-bold tracking-widest text-[10px]'>
								System Online
							</Text>
						</View>
					</View>
				</View>

				<View className='flex-1 relative'>
					<ScrollView
						ref={scrollViewRef}
						onContentSizeChange={() =>
							scrollViewRef.current?.scrollToEnd({ animated: true })
						}
						className='flex-1 p-4'>
						<View className='flex flex-col gap-4 pb-4'>
							{messages.map((msg) =>
								msg.sender === 'ai' ? (
									<View
										key={msg.id}
										className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-4 py-3 self-start max-w-[90%]'>
										<Text className='text-slate-300 text-[14px] leading-5'>
											{msg.text}
										</Text>
									</View>
								) : (
									<View
										key={msg.id}
										className='bg-[#A64D00] rounded-2xl rounded-tr-sm px-4 py-3 self-end max-w-[90%]'>
										{msg.isSpeaking ? (
											<SoundWaveformIndicator soundLevel={soundLevelAnim} />
										) : (
											<Text className='text-white text-[14px] leading-5'>
												{msg.text}
											</Text>
										)}
									</View>
								),
							)}
							{isLoading ? <BotTypingAnimation /> : null}
						</View>
					</ScrollView>
				</View>

				<View className='w-full px-4 py-6 flex-col border-t border-neutral-900 bg-[#0d0d0f]'>
					<View className='flex-row justify-center items-center gap-6'>
						<TouchableOpacity className='w-[72px] h-[72px] bg-[#27272a] border border-[#3f3f46] rounded-[12px] items-center justify-center'>
							<Image
								source={require('../assets/images/camera.png')}
								style={{ width: 32, height: 32, tintColor: '#D4D4D8' }}
								resizeMode='contain'
							/>
						</TouchableOpacity>

						<View className='items-center flex-col gap-3'>
							<TouchableOpacity
								onPressIn={!isGenerating ? onMicPress : undefined}
								onPress={isGenerating ? onStop : undefined}
								className={`w-[112px] h-[112px] rounded-[12px] items-center justify-center ${
									isListening || isGenerating
										? 'bg-[#2A1100] border-2 border-[#FF6600]'
										: 'bg-[#27272a] border border-[#3f3f46]'
								}`}>
								{isListening && !isGenerating ? <ListeningPulse /> : null}

								{isGenerating ? (
									<MaterialCommunityIcons name='stop' size={56} color='#FF6600' />
								) : (
									<Image
										source={require('../assets/images/micro.png')}
										style={{
											width: 56,
											height: 56,
											tintColor: isListening ? '#FF6600' : '#D4D4D8',
										}}
										resizeMode='contain'
									/>
								)}
							</TouchableOpacity>
							<Text
								className={`text-[10px] font-bold tracking-widest ${isListening || isGenerating ? 'text-[#FF6600]' : 'text-white'}`}>
								{isGenerating
									? 'NACIŚNIJ ABY ZATRZYMAĆ'
									: isListening
										? 'SŁUCHAM...'
										: 'NACIŚNIJ ŻEBY MÓWIĆ'}
							</Text>
						</View>

						<TouchableOpacity
							onPress={() => setShowTextInput(!showTextInput)}
							className={`w-[72px] h-[72px] border rounded-[12px] items-center justify-center ${showTextInput ? 'bg-[#2A1100] border-[#FF6600]' : 'bg-[#27272a] border-[#3f3f46]'}`}>
							<Image
								source={require('../assets/images/writing.png')}
								style={{
									width: 32,
									height: 32,
									tintColor: showTextInput ? '#FF6600' : '#D4D4D8',
								}}
								resizeMode='contain'
							/>
						</TouchableOpacity>
					</View>

					{showTextInput ? (
						<View className='flex-row w-full mt-6 items-center gap-2'>
							<TextInput
								className='flex-1 bg-[#1A1A1D] border border-neutral-800 text-slate-200 px-4 py-3 rounded-xl text-sm'
								placeholder='Wpisz swoje pytanie...'
								placeholderTextColor='#666'
								value={inputText}
								onChangeText={setInputText}
								onSubmitEditing={onSendText}
								autoFocus
							/>
							<TouchableOpacity
								className='bg-[#CC5500] w-[46px] h-[46px] rounded-xl items-center justify-center'
								onPress={onSendText}>
								<Feather name='send' size={18} color='white' />
							</TouchableOpacity>
						</View>
					) : null}
				</View>
			</View>
		</View>
	);
}
