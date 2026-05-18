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

const PRIMARY_ORANGE = '#FF7A00';
const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';

const QUICK_PROMPTS = [
	'Jak sprawdzić błąd?',
	'Pokaż schemat elektryczny',
	'Jak wykonać podstawowy serwis?',
	'Jakie części pasują?',
];

/**
 * Represents a single chat message.
 */
export interface Message {
	id: number;
	sender: 'ai' | 'user';
	text: string;
	isSpeaking?: boolean;
}

/**
 * Props for the LeftPanel component.
 */
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
	logoUrl?: string;
}

/**
 * Helper function to format basic markdown.
 * Currently supports bold text enclosed in double asterisks (**text**).
 *
 * @param text - The raw text string to format.
 * @returns An array of styled Text components.
 */
const renderFormattedText = (text: string) => {
	if (!text) return null;

	const parts = text.split(/(\*\*.*?\*\*)/g);

	return (
		<Text className='text-slate-300 text-[14px] leading-5'>
			{parts.map((part, index) => {
				if (part.startsWith('**') && part.endsWith('**')) {
					return (
						<Text key={index} className='font-bold text-white'>
							{part.slice(2, -2)}
						</Text>
					);
				}
				return <Text key={index}>{part}</Text>;
			})}
		</Text>
	);
};

/**
 * Animated waveform indicator reacting to sound levels.
 *
 * @param props.soundLevel - Animated value representing the current microphone input level.
 */
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

/**
 * Animated three-dot typing indicator for the AI bot.
 */
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

/**
 * Animated pulsing ring around the microphone button while listening.
 */
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
			className='absolute w-full h-full rounded-[16px] border-2 border-[#06B6D4]'
		/>
	);
};

/**
 * Sidebar component containing the chat interface, controls, and active device header.
 */
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
	logoUrl,
}: LeftPanelProps) {
	const scrollViewRef = useRef<ScrollView>(null);
	const router = useRouter();
	const micState = isGenerating ? 'processing' : isListening ? 'listening' : 'idle';
	const micStyle =
		micState === 'processing'
			? {
					backgroundColor: 'rgba(46, 16, 101, 0.92)',
					borderColor: 'rgba(139, 92, 246, 0.9)',
					shadowColor: PROCESSING_VIOLET,
					shadowOpacity: 0.42,
					shadowRadius: 24,
					iconColor: '#FFFFFF',
					label: 'PRZETWARZAM...',
					labelColor: '#FFFFFF',
				}
			: micState === 'listening'
				? {
						backgroundColor: 'rgba(8, 47, 73, 0.92)',
						borderColor: 'rgba(6, 182, 212, 0.9)',
						shadowColor: LISTENING_CYAN,
						shadowOpacity: 0.45,
						shadowRadius: 26,
						iconColor: '#FFFFFF',
						label: 'SŁUCHAM...',
						labelColor: '#FFFFFF',
					}
				: {
						backgroundColor: 'rgba(34, 34, 38, 0.92)',
						borderColor: 'rgba(255, 122, 0, 0.22)',
						shadowColor: '#000000',
						shadowOpacity: 0,
						shadowRadius: 0,
						iconColor: '#E8E8E8',
						label: 'NACIŚNIJ ŻEBY MÓWIĆ',
						labelColor: 'rgba(229, 231, 235, 0.78)',
					};

	return (
		<View className='w-[32%] h-full flex flex-col'>
			{/* Header section with back button and device details */}
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

				{logoUrl ? (
					<Image
						source={{ uri: logoUrl }}
						style={{ width: 90, height: 18 }}
						resizeMode='contain'
					/>
				) : null}

				<Text className='text-slate-200 font-bold ml-4 tracking-widest text-sm uppercase'>
					{currentSource}
				</Text>
			</View>

			{/* Chat container */}
			<View
				className='flex-1 rounded-2xl flex-col overflow-hidden relative'
				style={{
					backgroundColor: 'rgba(18, 18, 22, 0.92)',
					borderWidth: 1,
					borderColor: 'rgba(255, 122, 0, 0.35)',
					shadowColor: PRIMARY_ORANGE,
					shadowOpacity: 0.1,
					shadowRadius: 24,
				}}>
				<View className='p-4 border-b border-neutral-800 flex-row items-center bg-[#0d0d0f]'>
					<View className='w-12 h-12 rounded-md border border-[#FF7A00]/50 items-center justify-center mr-3'>
						<Image
							source={require('../assets/images/robot.png')}
							style={{ width: 32, height: 32, tintColor: PRIMARY_ORANGE }}
							resizeMode='contain'
						/>
					</View>
					<View>
						<Text className='text-slate-200 font-bold tracking-widest text-xs'>
							FIXO ASYSTENT
						</Text>
						<View className='flex-row items-center mt-1'>
							<View className='w-2 h-2 rounded-full bg-green-500 mr-1.5' />
							<Text className='text-[#22C55E] font-bold tracking-widest text-[11px]'>
								Online
							</Text>
						</View>
					</View>
				</View>

				{/* Messages scroll area */}
				<View className='flex-1 relative'>
					<ScrollView
						ref={scrollViewRef}
						onContentSizeChange={() =>
							scrollViewRef.current?.scrollToEnd({ animated: true })
						}
						className='flex-1 p-4'>
						<View className='flex flex-col gap-4 pb-4'>
							{messages.map((msg) => {
								if (msg.sender === 'ai' && !msg.text) return null;

								return msg.sender === 'ai' ? (
									<View
										key={msg.id}
										className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-4 py-3 self-start max-w-[90%]'>
										{renderFormattedText(msg.text)}
									</View>
								) : (
									<View
										key={msg.id}
										className='bg-[#B45309] rounded-2xl rounded-tr-sm px-4 py-3 self-end max-w-[90%]'>
										{msg.isSpeaking ? (
											<SoundWaveformIndicator soundLevel={soundLevelAnim} />
										) : (
											<Text className='text-white text-[14px] leading-5'>
												{msg.text}
											</Text>
										)}
									</View>
								);
							})}
							{isLoading ? <BotTypingAnimation /> : null}
						</View>
					</ScrollView>
				</View>

				{messages.length <= 1 ? (
					<View className='px-4 pb-3'>
						<View className='flex-row flex-wrap gap-2'>
							{QUICK_PROMPTS.map((prompt) => (
								<TouchableOpacity
									key={prompt}
									onPress={() => {
										setInputText(prompt);
										setShowTextInput(true);
									}}
									className='px-3 py-2 rounded-xl border border-white/10 bg-[#18181C]'>
									<Text className='text-slate-300 text-[11px] font-semibold'>
										{prompt}
									</Text>
								</TouchableOpacity>
							))}
						</View>
					</View>
				) : null}

				{/* Input controls */}
				<View
					className='mx-5 mb-5 p-4 flex-col rounded-3xl'
					style={{
						backgroundColor: 'rgba(22, 22, 26, 0.96)',
						borderWidth: 1,
						borderColor: 'rgba(255, 255, 255, 0.06)',
						shadowColor: '#000',
						shadowOffset: { width: 0, height: 8 },
						shadowOpacity: 0.35,
						shadowRadius: 28,
						elevation: 1,
					}}>
					<View className='flex-row justify-center items-center gap-4'>
						<TouchableOpacity className='w-16 h-16 bg-[#1F1F24]/90 border border-white/10 rounded-[14px] items-center justify-center'>
							<Image
								source={require('../assets/images/camera.png')}
								style={{ width: 28, height: 28, tintColor: '#D4D4D8' }}
								resizeMode='contain'
							/>
						</TouchableOpacity>

						<View className='items-center flex-col gap-2'>
							<TouchableOpacity
								onPressIn={!isGenerating ? onMicPress : undefined}
								onPress={isGenerating ? onStop : undefined}
								className='w-[88px] h-[88px] rounded-[16px] items-center justify-center'
								style={{
									backgroundColor: micStyle.backgroundColor,
									borderWidth: 1,
									borderColor: micStyle.borderColor,
									shadowColor: micStyle.shadowColor,
									shadowOpacity: micStyle.shadowOpacity,
									shadowRadius: micStyle.shadowRadius,
								}}>
								{isListening && !isGenerating ? <ListeningPulse /> : null}

								{isGenerating ? (
									<MaterialCommunityIcons
										name='stop'
										size={46}
										color={micStyle.iconColor}
									/>
								) : (
									<Image
										source={require('../assets/images/micro.png')}
										style={{
											width: 42,
											height: 42,
											tintColor: micStyle.iconColor,
										}}
										resizeMode='contain'
									/>
								)}
							</TouchableOpacity>
							<View className='flex-row items-center'>
								{isListening && !isGenerating ? (
									<View className='w-1.5 h-1.5 rounded-full mr-2 bg-[#06B6D4]' />
								) : null}
								<Text
									className='text-[11px] font-bold'
									style={{ color: micStyle.labelColor, letterSpacing: 0.8 }}>
									{isGenerating ? 'NACIŚNIJ ABY ZATRZYMAĆ' : micStyle.label}
								</Text>
							</View>
						</View>

						<TouchableOpacity
							onPress={() => setShowTextInput(!showTextInput)}
							className={`w-16 h-16 border rounded-[14px] items-center justify-center ${
								showTextInput
									? 'bg-[#2A1100] border-[#FF7A00]/70'
									: 'bg-[#1F1F24]/90 border-white/10'
							}`}>
							<Image
								source={require('../assets/images/writing.png')}
								style={{
									width: 28,
									height: 28,
									tintColor: showTextInput ? PRIMARY_ORANGE : '#D4D4D8',
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
