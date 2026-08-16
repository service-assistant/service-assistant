import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';

const PRIMARY_ORANGE = '#FF7A00';
const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';

type ChatMicrophoneButtonProps = {
	compact?: boolean;
	onPress: () => void;
	onCancel?: () => void;
	lightMode?: boolean;
	active?: boolean;
};

export function ChatMicrophoneButton({
	compact = false,
	onPress,
	onCancel,
	lightMode = false,
	active = false,
}: ChatMicrophoneButtonProps) {
	const iconColor = lightMode ? '#52525B' : '#D4D4D8';
	const size = compact ? 42 : 48;

	return (
		<TouchableOpacity
			testID='chat-microphone-button'
			onPress={active && onCancel ? onCancel : onPress}
			accessibilityRole='button'
			accessibilityLabel={active ? 'Anuluj nagrywanie' : 'Rozpocznij nagrywanie'}
			className='items-center justify-center'
			style={{
				width: size,
				height: size,
				marginRight: compact ? 4 : 6,
				borderRadius: size / 2,
				backgroundColor: 'transparent',
			}}>
			<MaterialCommunityIcons
				name={active ? 'close' : 'microphone'}
				size={compact ? 25 : 29}
				color={iconColor}
			/>
		</TouchableOpacity>
	);
}

type ChatSubmitButtonProps = {
	compact?: boolean;
	onPress: () => void;
	onMicrophonePress?: () => void;
	lightMode?: boolean;
	showMicrophoneState?: boolean;
	isListening?: boolean;
	isMicStarting?: boolean;
	isMicProcessing?: boolean;
};

export default function ChatSubmitButton({
	compact = false,
	onPress,
	onMicrophonePress,
	lightMode = false,
	showMicrophoneState = false,
	isListening = false,
	isMicStarting = false,
	isMicProcessing = false,
}: ChatSubmitButtonProps) {
	const microphoneState = !showMicrophoneState
		? 'idle'
		: isMicStarting
			? 'starting'
			: isMicProcessing
				? 'processing'
				: isListening
					? 'listening'
					: 'idle';
	const buttonStyle =
		microphoneState === 'starting'
			? {
					backgroundColor: lightMode ? '#FFFFFF' : '#202028',
					borderColor: lightMode ? 'rgba(8, 145, 178, 0.42)' : 'rgba(6, 182, 212, 0.9)',
					shadowColor: LISTENING_CYAN,
					shadowOpacity: lightMode ? 0.12 : 0.3,
					shadowRadius: lightMode ? 10 : 18,
					iconColor: lightMode ? '#0E7490' : '#FFFFFF',
				}
			: microphoneState === 'processing'
				? {
						backgroundColor: lightMode ? '#F3E8FF' : 'rgba(46, 16, 101, 0.92)',
						borderColor: lightMode
							? 'rgba(124, 58, 237, 0.38)'
							: 'rgba(139, 92, 246, 0.9)',
						shadowColor: PROCESSING_VIOLET,
						shadowOpacity: lightMode ? 0.16 : 0.42,
						shadowRadius: lightMode ? 14 : 24,
						iconColor: lightMode ? '#7C3AED' : '#FFFFFF',
					}
				: microphoneState === 'listening'
					? {
							backgroundColor: lightMode ? '#ECFEFF' : 'rgba(8, 47, 73, 0.92)',
							borderColor: lightMode
								? 'rgba(8, 145, 178, 0.38)'
								: 'rgba(6, 182, 212, 0.9)',
							shadowColor: LISTENING_CYAN,
							shadowOpacity: lightMode ? 0.17 : 0.45,
							shadowRadius: lightMode ? 14 : 26,
							iconColor: lightMode ? '#0891B2' : '#FFFFFF',
						}
					: {
							backgroundColor: PRIMARY_ORANGE,
							borderColor: PRIMARY_ORANGE,
							shadowColor: PRIMARY_ORANGE,
							shadowOpacity: 0.2,
							shadowRadius: 8,
							iconColor: '#FFFFFF',
						};
	const accessibilityLabel =
		microphoneState === 'starting'
			? 'Uruchamianie mikrofonu'
			: microphoneState === 'processing'
				? 'Zatrzymaj przetwarzanie mowy'
				: microphoneState === 'listening'
					? 'Mikrofon słucha'
					: 'Wyślij wiadomość';
	const handlesMicrophonePress = microphoneState !== 'idle' && onMicrophonePress !== undefined;
	const size = compact ? 46 : 56;

	return (
		<TouchableOpacity
			testID='chat-submit-button'
			onPress={handlesMicrophonePress ? onMicrophonePress : onPress}
			accessibilityRole='button'
			accessibilityLabel={accessibilityLabel}
			className='items-center justify-center'
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				borderWidth: 1,
				borderColor:
					microphoneState === 'listening'
						? buttonStyle.backgroundColor
						: buttonStyle.borderColor,
				backgroundColor: buttonStyle.backgroundColor,
				shadowColor: buttonStyle.shadowColor,
				shadowOffset: { width: 0, height: 0 },
				shadowOpacity: buttonStyle.shadowOpacity,
				shadowRadius: buttonStyle.shadowRadius,
				elevation: microphoneState === 'idle' ? 3 : lightMode ? 5 : 10,
			}}>
			{microphoneState === 'listening' ? (
				<MaterialCommunityIcons
					name='microphone'
					size={compact ? 23 : 28}
					color={buttonStyle.iconColor}
				/>
			) : microphoneState === 'processing' ? (
				<View
					testID='rotating-processing-icon'
					pointerEvents='none'
					className='chat-processing-square'
					style={{
						width: compact ? 17 : 20,
						height: compact ? 17 : 20,
						borderRadius: 2,
						backgroundColor: buttonStyle.iconColor,
					}}
				/>
			) : microphoneState === 'starting' ? (
				<ActivityIndicator color={buttonStyle.iconColor} size='small' />
			) : (
				<Feather
					name='arrow-up-right'
					size={compact ? 24 : 30}
					color={buttonStyle.iconColor}
				/>
			)}
		</TouchableOpacity>
	);
}
