import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useRef } from 'react';
import { Animated, Image, Platform, Text, TouchableOpacity, View } from 'react-native';

const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';

type ControlPanelProps = {
	orientation: 'horizontal' | 'vertical';
	isListening: boolean;
	isMicProcessing: boolean;
	isMicRestartBlocked: boolean;
	isWritingActive: boolean;
	isSpeechInputUnavailable?: boolean;
	isVoiceOutputUnavailable?: boolean;
	onMicPress: () => void;
	onWritingPress: () => void;
};

const ListeningPulse = () => {
	const scale = useRef(new Animated.Value(1)).current;
	const opacity = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		const animation = Animated.loop(
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
		);

		animation.start();
		return () => animation.stop();
	}, [opacity, scale]);

	return (
		<Animated.View
			style={{
				position: 'absolute',
				width: '100%',
				height: '100%',
				borderRadius: 12,
				borderWidth: 2,
				borderColor: LISTENING_CYAN,
				transform: [{ scale }],
				opacity,
			}}
		/>
	);
};

export default function ControlPanel({
	orientation,
	isListening,
	isMicProcessing,
	isMicRestartBlocked,
	isWritingActive,
	isSpeechInputUnavailable = false,
	isVoiceOutputUnavailable = false,
	onMicPress,
	onWritingPress,
}: ControlPanelProps) {
	const isHorizontal = orientation === 'horizontal';
	const sideButtonSize = 82;
	const centerButtonSize = 96;
	const sideIconSize = 34;
	const centerIconSize = 50;
	const centerColumnWidth = isHorizontal ? 170 : 124;
	const panelWidth = isHorizontal ? 384 : 132;
	const panelHeight = isHorizontal ? 130 : 404;
	const panelRadius = isHorizontal ? 54 : 68;
	const horizontalSideOffset = 28;
	const horizontalCenterTop = 8;
	const horizontalSideTop = horizontalCenterTop + centerButtonSize - sideButtonSize;
	const horizontalCenterLeft = (panelWidth - centerColumnWidth) / 2;
	const verticalEdgeGap = 36;
	const verticalMicSlotHeight = centerButtonSize + 22;
	const micState = isMicProcessing
		? 'processing'
		: isListening
			? 'listening'
			: isSpeechInputUnavailable
				? 'unavailable'
				: 'idle';
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
				: micState === 'unavailable'
					? {
							backgroundColor: 'rgba(69, 10, 10, 0.88)',
							borderColor: 'rgba(239, 68, 68, 0.8)',
							shadowColor: '#EF4444',
							shadowOpacity: 0.18,
							shadowRadius: 14,
							iconColor: '#FCA5A5',
							label: 'MOWA NIEDOSTĘPNA',
							labelColor: '#FCA5A5',
						}
					: {
							backgroundColor: '#202028',
							borderColor: '#34313A',
							shadowColor: '#000000',
							shadowOpacity: 0,
							shadowRadius: 0,
							iconColor: '#F0F0F0',
							label: 'Naciśnij, aby mówić',
							labelColor: 'rgba(229, 231, 235, 0.58)',
						};
	const micLabel = isMicProcessing
		? 'Przetwarzam...'
		: isSpeechInputUnavailable
			? 'Mowa niedostępna'
			: isHorizontal
				? isListening
					? 'Słucham...'
					: 'Naciśnij żeby mówić'
				: micStyle.label;
	const controlButtonStyle = {
		width: 82,
		height: 82,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: '#2A2D36',
		backgroundColor: '#1B1D25',
	};
	const controlPanelBlurProps =
		Platform.OS === 'android'
			? ({
					intensity: 8,
					blurReductionFactor: 4,
					experimentalBlurMethod: 'dimezisBlurView',
				} as const)
			: { intensity: Platform.OS === 'web' ? 18 : 24 };

	const renderSideButton = (type: 'camera' | 'writing') => {
		const isWritingButton = type === 'writing';

		return (
			<TouchableOpacity
				key={type}
				onPress={isWritingButton ? onWritingPress : undefined}
				activeOpacity={1}
				className='rounded-[12px] items-center justify-center'
				style={{
					...controlButtonStyle,
					width: sideButtonSize,
					height: sideButtonSize,
					backgroundColor: isWritingActive
						? '#1C1F28'
						: controlButtonStyle.backgroundColor,
					borderColor: isWritingActive ? '#3A404C' : controlButtonStyle.borderColor,
				}}>
				<Image
					source={
						type === 'camera'
							? require('../assets/images/camera.png')
							: require('../assets/images/writing.png')
					}
					style={{
						width: sideIconSize,
						height: sideIconSize,
						tintColor: isWritingActive ? '#FFFFFF' : '#D4D4D8',
					}}
					resizeMode='contain'
				/>
			</TouchableOpacity>
		);
	};

	const micButton = (
		<View
			key='microphone'
			className='items-center flex-col'
			style={{
				width: centerColumnWidth,
			}}>
			<TouchableOpacity
				onPress={onMicPress}
				disabled={isMicRestartBlocked}
				className='items-center justify-center'
				style={{
					width: centerButtonSize,
					height: centerButtonSize,
					borderRadius: 18,
					backgroundColor: micStyle.backgroundColor,
					borderWidth: 1,
					borderColor: micStyle.borderColor,
					shadowColor: micStyle.shadowColor,
					shadowOffset: { width: 0, height: 0 },
					shadowOpacity: micStyle.shadowOpacity,
					shadowRadius: micStyle.shadowRadius,
					elevation: micState === 'idle' ? 5 : 10,
				}}>
				{isListening && !isMicProcessing ? <ListeningPulse /> : null}
				{isMicProcessing ? (
					<MaterialCommunityIcons
						name='stop'
						size={centerIconSize}
						color={micStyle.iconColor}
					/>
				) : (
					<>
						<Image
							source={require('../assets/images/micro.png')}
							style={{
								width: centerIconSize,
								height: centerIconSize,
								tintColor: micStyle.iconColor,
							}}
							resizeMode='contain'
						/>
						{isSpeechInputUnavailable ? (
							<View
								className='absolute items-center justify-center bg-[#3A1010] border border-[#EF4444]'
								style={{
									left: 12,
									bottom: 12,
									width: 28,
									height: 28,
									borderRadius: 14,
								}}>
								<MaterialCommunityIcons
									name='microphone-off'
									size={18}
									color='#EF4444'
								/>
							</View>
						) : null}
						{isVoiceOutputUnavailable ? (
							<View
								className='absolute items-center justify-center bg-[#3A1010] border border-[#EF4444]'
								style={{
									right: 12,
									bottom: 12,
									width: 28,
									height: 28,
									borderRadius: 14,
								}}>
								<MaterialCommunityIcons
									name='volume-off'
									size={18}
									color='#EF4444'
								/>
							</View>
						) : null}
					</>
				)}
			</TouchableOpacity>
			<View
				className='flex-row items-center justify-center'
				style={{ marginTop: isHorizontal ? 2 : 4 }}>
				{isListening && !isMicProcessing ? (
					<View className='w-1.5 h-1.5 rounded-full mr-2 bg-[#06B6D4]' />
				) : null}
				<Text
					className='text-center text-[11px] font-bold'
					style={{
						height: 14,
						color: micStyle.labelColor,
						fontSize: 11,
						lineHeight: 14,
						letterSpacing: 0.8,
						textShadowColor: 'rgba(0, 0, 0, 0.8)',
						textShadowOffset: { width: 0, height: 1 },
						textShadowRadius: 3,
					}}
					numberOfLines={1}>
					{micLabel}
				</Text>
			</View>
		</View>
	);

	const controls = isHorizontal
		? [renderSideButton('camera'), micButton, renderSideButton('writing')]
		: [renderSideButton('writing'), micButton, renderSideButton('camera')];

	return (
		<View className='relative' style={{ width: panelWidth, height: panelHeight }}>
			<BlurView
				{...controlPanelBlurProps}
				tint='dark'
				pointerEvents='none'
				className='absolute inset-0 overflow-hidden'
				style={{
					borderRadius: panelRadius,
					borderWidth: 1,
					borderColor: '#242833',
					shadowColor: '#000',
					shadowOffset: { width: 0, height: 10 },
					shadowOpacity: 0.22,
					shadowRadius: 22,
					elevation: 6,
					zIndex: 0,
					backgroundColor: 'rgba(20, 22, 30, 0.92)',
					...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(8px)' } as any) : {}),
				}}
			/>
			<View
				className={`${isHorizontal ? 'flex-row' : 'flex-col'} items-center px-3`}
				style={
					isHorizontal
						? {
								width: panelWidth,
								height: panelHeight,
								paddingVertical: 6,
								gap: 0,
								justifyContent: 'space-between',
								zIndex: 1,
							}
						: {
								width: panelWidth,
								height: panelHeight,
								paddingVertical: 34,
							}
				}>
				{isHorizontal ? (
					<>
						<View
							style={{
								position: 'absolute',
								left: horizontalSideOffset,
								top: horizontalSideTop,
							}}>
							{controls[0]}
						</View>
						<View
							style={{
								position: 'absolute',
								left: horizontalCenterLeft,
								top: horizontalCenterTop,
							}}>
							{controls[1]}
						</View>
						<View
							style={{
								position: 'absolute',
								right: horizontalSideOffset,
								top: horizontalSideTop,
							}}>
							{controls[2]}
						</View>
					</>
				) : (
					<>
						<View style={{ position: 'absolute', top: verticalEdgeGap }}>
							{controls[0]}
						</View>
						<View
							style={{
								position: 'absolute',
								top: (panelHeight - verticalMicSlotHeight) / 2,
							}}>
							{controls[1]}
						</View>
						<View style={{ position: 'absolute', bottom: verticalEdgeGap }}>
							{controls[2]}
						</View>
					</>
				)}
			</View>
		</View>
	);
}
