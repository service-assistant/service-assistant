import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
	Animated,
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';

const PRIMARY_ORANGE = '#FF7A00';

const QUICK_PROMPTS = [
	'Nie działa podnoszenie wideł',
	'Pokaż procedurę diagnostyczną',
	'Jak bezpiecznie podnosić?',
	'Gdzie sprawdzić poziom oleju?',
	'Maszyna nie rusza po uruchomieniu',
	'Mam błąd 2:002',
];

const INPUT_PLACEHOLDERS = [
	'co oznacza błąd 2:101?',
	'jak sprawdzić stycznik?',
	'czemu pompa hałasuje?',
	'gdzie jest bezpiecznik?',
	'jak odpowietrzyć hydraulikę?',
];

export type KeyboardFrame = {
	screenY: number;
	height: number;
};

type StartPromptViewProps = {
	compact?: boolean;
	height: number;
	keyboardFrame: KeyboardFrame | null;
	inputText: string;
	inputRef: React.RefObject<TextInput | null>;
	hasStartedChat: boolean;
	shouldFocusInput: boolean;
	onChangeText: (text: string) => void;
	onSend: () => void;
	onShowTextInputChange: (show: boolean) => void;
	onShouldFocusStartPromptInputChange: (shouldFocus: boolean) => void;
	lightMode?: boolean;
};

export default function StartPromptView({
	compact = false,
	height,
	keyboardFrame,
	inputText,
	inputRef,
	hasStartedChat,
	shouldFocusInput,
	onChangeText,
	onSend,
	onShowTextInputChange,
	onShouldFocusStartPromptInputChange,
	lightMode = false,
}: StartPromptViewProps) {
	const promptMaxWidth = compact ? '100%' : 980;
	const chipWidth = compact ? '100%' : '48%';
	const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
	const [isInputFocused, setIsInputFocused] = React.useState(false);
	const [containerHeight, setContainerHeight] = React.useState(0);
	const [contentLayout, setContentLayout] = React.useState({ y: 0, height: 0 });
	const [inputLayout, setInputLayout] = React.useState({ y: 0, height: 0 });
	const placeholderTranslateY = React.useRef(new Animated.Value(0)).current;
	const placeholderOpacity = React.useRef(new Animated.Value(1)).current;
	const hasSeenKeyboardFrameRef = React.useRef(false);
	const maximumContainerHeightRef = React.useRef(0);
	const placeholderText = `Np. ${INPUT_PLACEHOLDERS[placeholderIndex]}`;
	const shouldUseNativePlaceholder = inputText.length === 0 && isInputFocused;
	const shouldShowAnimatedPlaceholder = inputText.length === 0 && !isInputFocused;
	const nativePlaceholder = shouldUseNativePlaceholder ? placeholderText : '';
	const hasKeyboardResize =
		isInputFocused && maximumContainerHeightRef.current - containerHeight > 80;
	const isKeyboardLayoutActive = keyboardFrame !== null || hasKeyboardResize;
	const currentInputBottom = contentLayout.y + inputLayout.y + inputLayout.height;
	const containerTopOnScreen = Math.max(0, height - containerHeight);
	const keyboardTopInContainer = keyboardFrame
		? keyboardFrame.screenY - containerTopOnScreen
		: containerHeight;
	const availableContainerBottom = Math.min(containerHeight, Math.max(0, keyboardTopInContainer));
	const desiredInputBottom = availableContainerBottom - 12;
	const keyboardTranslateY =
		isKeyboardLayoutActive && currentInputBottom > 0
			? desiredInputBottom - currentInputBottom
			: 0;

	React.useEffect(() => {
		let activeAnimation: Animated.CompositeAnimation | null = null;
		let isActive = true;

		const resetPlaceholderAnimation = () => {
			activeAnimation?.stop();
			placeholderTranslateY.stopAnimation();
			placeholderOpacity.stopAnimation();
			placeholderTranslateY.setValue(0);
			placeholderOpacity.setValue(1);
		};

		resetPlaceholderAnimation();

		if (!shouldShowAnimatedPlaceholder) {
			return resetPlaceholderAnimation;
		}

		const animateNextPlaceholder = () => {
			activeAnimation = Animated.parallel([
				Animated.timing(placeholderTranslateY, {
					toValue: 10,
					duration: 180,
					useNativeDriver: true,
				}),
				Animated.timing(placeholderOpacity, {
					toValue: 0,
					duration: 180,
					useNativeDriver: true,
				}),
			]);

			activeAnimation.start(({ finished }) => {
				if (!finished || !isActive) return;

				setPlaceholderIndex(
					(currentIndex) => (currentIndex + 1) % INPUT_PLACEHOLDERS.length,
				);
				placeholderTranslateY.setValue(-14);
				placeholderOpacity.setValue(0);
				activeAnimation = Animated.parallel([
					Animated.timing(placeholderTranslateY, {
						toValue: 0,
						duration: 680,
						useNativeDriver: true,
					}),
					Animated.timing(placeholderOpacity, {
						toValue: 1,
						duration: 540,
						useNativeDriver: true,
					}),
				]);
				activeAnimation.start();
			});
		};

		const interval = setInterval(animateNextPlaceholder, 5200);
		(interval as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();

		return () => {
			isActive = false;
			clearInterval(interval);
			resetPlaceholderAnimation();
		};
	}, [placeholderOpacity, placeholderTranslateY, shouldShowAnimatedPlaceholder]);

	React.useEffect(() => {
		if (!shouldFocusInput) return;

		const focusInput = () => inputRef.current?.focus();
		const firstFocusTimeout = setTimeout(focusInput, 0);
		const secondFocusTimeout = setTimeout(focusInput, 80);
		const retryFocusTimeout = setTimeout(focusInput, 180);
		const lateFocusTimeout = setTimeout(focusInput, 320);

		return () => {
			clearTimeout(firstFocusTimeout);
			clearTimeout(secondFocusTimeout);
			clearTimeout(retryFocusTimeout);
			clearTimeout(lateFocusTimeout);
		};
	}, [inputRef, shouldFocusInput]);

	React.useEffect(() => {
		if (keyboardFrame) {
			hasSeenKeyboardFrameRef.current = true;
			return;
		}

		if (hasSeenKeyboardFrameRef.current) {
			hasSeenKeyboardFrameRef.current = false;
			setIsInputFocused(false);
		}
	}, [keyboardFrame]);

	const handleFocus = () => {
		setIsInputFocused(true);
		onShowTextInputChange(true);
		onShouldFocusStartPromptInputChange(false);
	};

	const handlePressIn = () => {
		setIsInputFocused(true);
		onShowTextInputChange(true);
	};

	const handleBlur = () => {
		setIsInputFocused(false);
		onShouldFocusStartPromptInputChange(false);
		if (!hasStartedChat) onShowTextInputChange(false);
	};

	const handleEndEditing = () => {
		setIsInputFocused(false);
	};

	const renderInput = (autoFocus = false, onLayout?: (event: LayoutChangeEvent) => void) => (
		<Pressable
			onLayout={onLayout}
			onPress={() => inputRef.current?.focus()}
			hitSlop={{ top: 12, right: 8, bottom: 12, left: 8 }}
			accessible={false}
			className='flex-row items-center'
			style={{
				width: '100%',
				height: compact ? 62 : 74,
				borderRadius: compact ? 31 : 37,
				backgroundColor: lightMode ? '#FFFFFF' : '#242424',
				borderWidth: 1,
				borderColor: lightMode ? 'rgba(20, 20, 20, 0.09)' : 'rgba(255, 255, 255, 0.08)',
				paddingLeft: compact ? 18 : 32,
				paddingRight: compact ? 8 : 10,
				marginBottom: compact ? 20 : 22,
				shadowColor: '#141414',
				shadowOffset: { width: 0, height: 8 },
				shadowOpacity: lightMode ? 0.04 : 0.14,
				shadowRadius: 24,
				elevation: lightMode ? 3 : 5,
			}}>
			<TextInput
				ref={inputRef}
				className={`flex-1 ${lightMode ? 'text-[#18181B]' : 'text-white'}`}
				placeholder={nativePlaceholder}
				placeholderTextColor={lightMode ? '#71717A' : '#A1A1AA'}
				value={inputText}
				onChangeText={onChangeText}
				onSubmitEditing={onSend}
				onPressIn={handlePressIn}
				onFocus={handleFocus}
				onBlur={handleBlur}
				onEndEditing={handleEndEditing}
				style={{
					height: '100%',
					fontSize: compact ? 16 : 20,
					lineHeight: compact ? 22 : 27,
					paddingHorizontal: 0,
					paddingVertical: 0,
					includeFontPadding: false,
					textAlignVertical: 'center',
				}}
				autoFocus={autoFocus}
			/>
			{shouldShowAnimatedPlaceholder ? (
				<View
					pointerEvents='none'
					className='absolute flex-row items-center'
					style={{
						left: compact ? 18 : 32,
						right: compact ? 58 : 74,
					}}>
					<Text
						className='text-[#A1A1AA]'
						style={{
							fontSize: compact ? 16 : 20,
							lineHeight: compact ? 22 : 27,
						}}>
						Np.{' '}
					</Text>
					<Animated.Text
						className='text-[#A1A1AA] flex-1'
						numberOfLines={1}
						style={{
							fontSize: compact ? 16 : 20,
							lineHeight: compact ? 22 : 27,
							opacity: placeholderOpacity,
							transform: [{ translateY: placeholderTranslateY }],
						}}>
						{INPUT_PLACEHOLDERS[placeholderIndex]}
					</Animated.Text>
				</View>
			) : null}
			<TouchableOpacity
				onPress={onSend}
				className='items-center justify-center'
				style={{
					width: compact ? 46 : 56,
					height: compact ? 46 : 56,
					borderRadius: compact ? 23 : 28,
					backgroundColor: PRIMARY_ORANGE,
					shadowColor: PRIMARY_ORANGE,
					shadowOffset: { width: 0, height: 4 },
					shadowOpacity: 0.2,
					shadowRadius: 8,
					elevation: 3,
				}}>
				<Feather name='arrow-up-right' size={compact ? 24 : 30} color='#FFFFFF' />
			</TouchableOpacity>
		</Pressable>
	);

	return (
		<View
			className='flex-1 justify-center'
			onLayout={(event) => {
				const nextHeight = event.nativeEvent.layout.height;
				if (!isInputFocused) {
					maximumContainerHeightRef.current = Math.max(
						maximumContainerHeightRef.current,
						nextHeight,
					);
				}
				setContainerHeight((currentHeight) =>
					currentHeight === nextHeight ? currentHeight : nextHeight,
				);
			}}
			style={{
				paddingHorizontal: compact ? 20 : 24,
				paddingBottom: compact ? 154 : 28,
			}}>
			<View
				onLayout={(event) => {
					const { y, height: nextHeight } = event.nativeEvent.layout;
					setContentLayout((currentLayout) =>
						currentLayout.y === y && currentLayout.height === nextHeight
							? currentLayout
							: { y, height: nextHeight },
					);
				}}
				style={{
					width: '100%',
					maxWidth: promptMaxWidth,
					alignSelf: 'center',
					transform: [{ translateY: keyboardTranslateY }],
				}}>
				<View>
					<Text
						className={`${lightMode ? 'text-[#18181B]' : 'text-white'} font-semibold`}
						numberOfLines={1}
						style={{
							width: '100%',
							maxWidth: promptMaxWidth,
							alignSelf: 'center',
							fontSize: compact ? 22 : 26,
							lineHeight: compact ? 28 : 33,
							marginBottom: compact ? 6 : 8,
						}}>
						Jak mogę pomóc?
					</Text>
					<Text
						className='font-normal'
						numberOfLines={compact ? 2 : 1}
						adjustsFontSizeToFit={!compact}
						minimumFontScale={0.86}
						style={{
							width: '100%',
							maxWidth: promptMaxWidth,
							alignSelf: 'center',
							color: lightMode ? '#52525B' : 'rgba(244, 244, 245, 0.84)',
							fontSize: compact ? 14 : 17,
							lineHeight: compact ? 20 : 24,
							marginBottom: compact ? 24 : 34,
						}}>
						Zadaj pytanie o usterkę, diagnostykę lub procedurę naprawy.
					</Text>
				</View>

				{renderInput(shouldFocusInput, (event) => {
					const { y, height: nextHeight } = event.nativeEvent.layout;
					setInputLayout((currentLayout) =>
						currentLayout.y === y && currentLayout.height === nextHeight
							? currentLayout
							: { y, height: nextHeight },
					);
				})}

				<View
					className='flex-row flex-wrap justify-center'
					pointerEvents={isKeyboardLayoutActive ? 'none' : 'auto'}
					style={{
						columnGap: compact ? 8 : 12,
						rowGap: compact ? 6 : 9,
						opacity: isKeyboardLayoutActive ? 0 : 1,
					}}>
					{QUICK_PROMPTS.map((prompt) => (
						<TouchableOpacity
							key={prompt}
							onPress={() => {
								onChangeText(prompt);
								onShowTextInputChange(false);
							}}
							className='items-center justify-center'
							style={{
								width: chipWidth,
								minHeight: compact ? 38 : 42,
								paddingHorizontal: compact ? 12 : 18,
								paddingVertical: compact ? 8 : 9,
								borderRadius: compact ? 19 : 21,
								borderWidth: StyleSheet.hairlineWidth,
								borderColor: lightMode
									? 'rgba(30, 30, 30, 0.075)'
									: 'rgba(255, 255, 255, 0.055)',
								backgroundColor: lightMode
									? 'rgba(255, 255, 255, 0.94)'
									: 'rgba(255, 255, 255, 0.07)',
								shadowColor: '#000000',
								shadowOffset: { width: 0, height: 1 },
								shadowOpacity: lightMode ? 0.02 : 0.04,
								shadowRadius: 5,
								elevation: 0,
							}}>
							<Text
								className='text-center'
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={0.82}
								style={{
									color: lightMode ? '#3F3F46' : 'rgba(244, 244, 245, 0.9)',
									fontSize: compact ? 13 : 16,
									lineHeight: compact ? 17 : 21,
								}}>
								{prompt}
							</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>
		</View>
	);
}
