import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

const PRIMARY_ORANGE = '#FF7A00';

const QUICK_PROMPTS = [
	'Nie działa podnoszenie wideł',
	'Pokaż procedurę diagnostyczną',
	'Jak bezpiecznie podnosić?',
	'Gdzie sprawdzić poziom oleju?',
	'Maszyna nie rusza po uruchomieniu',
	'Mam błąd 2:002',
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
	onChangeText: (text: string) => void;
	onSend: () => void;
	onShowTextInputChange: (show: boolean) => void;
	onShouldFocusStartPromptInputChange: (shouldFocus: boolean) => void;
};

export default function StartPromptView({
	compact = false,
	height,
	keyboardFrame,
	inputText,
	inputRef,
	hasStartedChat,
	onChangeText,
	onSend,
	onShowTextInputChange,
	onShouldFocusStartPromptInputChange,
}: StartPromptViewProps) {
	const promptMaxWidth = compact ? '100%' : 980;
	const chipWidth = compact ? '100%' : '48%';
	const keyboardOverlap = keyboardFrame
		? Math.max(0, height - keyboardFrame.screenY, keyboardFrame.height)
		: 0;
	const keyboardBottomOffset = keyboardOverlap + (compact ? 18 : 22);

	const handleFocus = () => {
		onShowTextInputChange(true);
		onShouldFocusStartPromptInputChange(false);
	};

	const handleBlur = () => {
		onShouldFocusStartPromptInputChange(false);
		if (!hasStartedChat) onShowTextInputChange(false);
	};

	const renderInput = (autoFocus = false) => (
		<View
			className='flex-row items-center'
			style={{
				width: '100%',
				maxWidth: keyboardFrame ? promptMaxWidth : undefined,
				alignSelf: keyboardFrame ? 'center' : undefined,
				height: compact ? 56 : 68,
				borderRadius: compact ? 28 : 34,
				backgroundColor: '#242424',
				paddingLeft: compact ? 18 : 32,
				paddingRight: compact ? 7 : 10,
				marginBottom: keyboardFrame ? undefined : compact ? 20 : 22,
			}}>
			<TextInput
				ref={inputRef}
				className='flex-1 text-white'
				placeholder='Np. nie działa podnoszenie wideł'
				placeholderTextColor='#A1A1AA'
				value={inputText}
				onChangeText={onChangeText}
				onSubmitEditing={onSend}
				onFocus={handleFocus}
				onBlur={handleBlur}
				style={{
					fontSize: compact ? 16 : 20,
					lineHeight: compact ? 22 : 27,
				}}
				autoFocus={autoFocus}
			/>
			<TouchableOpacity
				onPress={onSend}
				className='items-center justify-center'
				style={{
					width: compact ? 44 : 54,
					height: compact ? 44 : 54,
					borderRadius: compact ? 22 : 27,
					backgroundColor: PRIMARY_ORANGE,
				}}>
				<Feather name='arrow-up-right' size={compact ? 24 : 30} color='#FFFFFF' />
			</TouchableOpacity>
		</View>
	);

	return (
		<View
			className='flex-1 justify-center'
			style={{
				paddingHorizontal: compact ? 20 : 24,
				paddingBottom: compact ? 154 : 28,
			}}>
			<View
				style={{
					width: '100%',
					maxWidth: promptMaxWidth,
					alignSelf: 'center',
				}}>
				<View style={{ opacity: keyboardFrame ? 0 : 1 }}>
					<Text
						className='text-white font-semibold'
						numberOfLines={1}
						style={{
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
							color: 'rgba(244, 244, 245, 0.84)',
							fontSize: compact ? 14 : 17,
							lineHeight: compact ? 20 : 24,
							marginBottom: compact ? 24 : 34,
						}}>
						Zadaj pytanie o usterkę, diagnostykę lub procedurę naprawy.
					</Text>
				</View>

				<View
					pointerEvents={keyboardFrame ? 'none' : 'auto'}
					style={{ opacity: keyboardFrame ? 0 : 1 }}>
					{renderInput()}
				</View>

				<View
					className='flex-row flex-wrap justify-center'
					pointerEvents={keyboardFrame ? 'none' : 'auto'}
					style={{
						columnGap: compact ? 8 : 12,
						rowGap: compact ? 6 : 9,
						opacity: keyboardFrame ? 0 : 1,
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
								height: compact ? 34 : 36,
								paddingHorizontal: compact ? 12 : 18,
								borderRadius: compact ? 17 : 18,
								borderWidth: 1,
								borderColor: 'rgba(255, 255, 255, 0.09)',
								backgroundColor: 'rgba(5, 5, 5, 0.72)',
							}}>
							<Text
								className='text-center'
								numberOfLines={1}
								adjustsFontSizeToFit
								minimumFontScale={0.82}
								style={{
									color: 'rgba(244, 244, 245, 0.9)',
									fontSize: compact ? 13 : 16,
									lineHeight: compact ? 17 : 21,
								}}>
								{prompt}
							</Text>
						</TouchableOpacity>
					))}
				</View>
			</View>
			{keyboardFrame ? (
				<View
					className='absolute left-0 right-0'
					style={{
						bottom: keyboardBottomOffset,
						paddingHorizontal: compact ? 20 : 24,
						zIndex: 20,
					}}>
					<Text
						className='text-white font-semibold'
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
						numberOfLines={1}
						adjustsFontSizeToFit
						minimumFontScale={0.84}
						style={{
							width: '100%',
							maxWidth: promptMaxWidth,
							alignSelf: 'center',
							color: 'rgba(244, 244, 245, 0.84)',
							fontSize: compact ? 14 : 17,
							lineHeight: compact ? 20 : 24,
							marginBottom: compact ? 24 : 34,
						}}>
						Zadaj pytanie o usterkę, diagnostykę lub procedurę naprawy.
					</Text>
					{renderInput(true)}
				</View>
			) : null}
		</View>
	);
}
