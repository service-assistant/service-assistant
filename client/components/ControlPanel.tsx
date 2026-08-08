import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Text, TouchableOpacity, View } from 'react-native';

const LISTENING_CYAN = '#06B6D4';
const LIGHT_STARTING_BACKGROUND = '#CFFAFE';
const DARK_STARTING_BACKGROUND = 'rgba(8, 145, 178, 0.62)';
const LIGHT_STARTING_ICON = '#0E7490';
const PROCESSING_VIOLET = '#8B5CF6';

type ControlPanelProps = {
	orientation: 'horizontal' | 'vertical';
	edgeToEdge?: boolean;
	isListening: boolean;
	isMicStarting: boolean;
	isMicProcessing: boolean;
	isMicRestartBlocked: boolean;
	isWritingActive: boolean;
	isSpeechInputUnavailable?: boolean;
	isVoiceOutputUnavailable?: boolean;
	onMicPress: () => void;
	onWritingPress: () => void;
	lightMode?: boolean;
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

const MicStartingIndicator = ({
	lightMode,
	iconSize,
}: {
	lightMode: boolean;
	iconSize: number;
}) => {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		Animated.timing(progress, {
			toValue: 1,
			duration: 1600,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: false,
		}).start();
	}, [progress]);

	const height = progress.interpolate({
		inputRange: [0, 1],
		outputRange: ['0%', '100%'],
	});
	const iconColor = progress.interpolate({
		inputRange: [0, 1],
		outputRange: lightMode ? ['#3F3F46', LIGHT_STARTING_ICON] : ['#F0F0F0', '#FFFFFF'],
	});

	return (
		<>
			<View
				testID='mic-starting-fill-clip'
				pointerEvents='none'
				style={{
					position: 'absolute',
					top: 0,
					right: 0,
					bottom: 0,
					left: 0,
					borderRadius: 17,
					overflow: 'hidden',
				}}>
				<Animated.View
					testID='mic-starting-fill'
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						bottom: 0,
						height,
						backgroundColor: lightMode
							? LIGHT_STARTING_BACKGROUND
							: DARK_STARTING_BACKGROUND,
					}}
				/>
			</View>
			<Animated.Image
				testID='mic-starting-icon'
				source={require('../assets/images/micro.png')}
				style={{
					width: iconSize,
					height: iconSize,
					tintColor: iconColor,
				}}
				resizeMode='contain'
			/>
		</>
	);
};

const RotatingProcessingIcon = ({ color, size }: { color: string; size: number }) => {
	const rotation = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		let quarterTurns = 0;
		const interval = setInterval(() => {
			quarterTurns += 1;
			Animated.timing(rotation, {
				toValue: quarterTurns,
				duration: 450,
				easing: Easing.out(Easing.cubic),
				useNativeDriver: true,
			}).start(({ finished }) => {
				if (finished && quarterTurns === 4) {
					rotation.setValue(0);
					quarterTurns = 0;
				}
			});
		}, 1000);

		return () => clearInterval(interval);
	}, [rotation]);

	const rotate = rotation.interpolate({
		inputRange: [0, 4],
		outputRange: ['0deg', '360deg'],
	});

	return (
		<Animated.View
			testID='rotating-processing-icon'
			pointerEvents='none'
			style={{ transform: [{ rotate }] }}>
			<MaterialCommunityIcons name='stop' size={size} color={color} />
		</Animated.View>
	);
};

export default function ControlPanel({
	orientation,
	edgeToEdge = false,
	isListening,
	isMicStarting,
	isMicProcessing,
	isMicRestartBlocked,
	isWritingActive,
	isSpeechInputUnavailable = false,
	isVoiceOutputUnavailable = false,
	onMicPress,
	onWritingPress,
	lightMode = false,
}: ControlPanelProps) {
	const isHorizontal = orientation === 'horizontal';
	const useEdgeToEdge = isHorizontal && edgeToEdge;
	const sideButtonSize = 82;
	const centerButtonSize = 96;
	const sideIconSize = 34;
	const centerIconSize = 50;
	const centerColumnWidth = isHorizontal ? 170 : 124;
	const horizontalControlsWidth = 384;
	const panelWidth = isHorizontal ? (useEdgeToEdge ? '100%' : 384) : 124;
	const panelHeight = isHorizontal ? (useEdgeToEdge ? 162 : 130) : 388;
	const panelRadius = isHorizontal ? (useEdgeToEdge ? 0 : 54) : 38;
	const horizontalSideOffset = 28;
	const horizontalPanelTopPadding = useEdgeToEdge ? 16 : 0;
	const horizontalCenterTop = horizontalPanelTopPadding + 8;
	const horizontalSideTop = horizontalCenterTop + centerButtonSize - sideButtonSize;
	const horizontalCenterLeft = (horizontalControlsWidth - centerColumnWidth) / 2;
	const verticalEdgeGap = 30;
	const verticalMicSlotHeight = centerButtonSize + 22;
	const micState = isMicStarting
		? 'starting'
		: isMicProcessing
			? 'processing'
			: isListening
				? 'listening'
				: isSpeechInputUnavailable
					? 'unavailable'
					: 'idle';
	const micStyle =
		micState === 'starting'
			? {
					backgroundColor: lightMode ? '#FFFFFF' : '#202028',
					borderColor: lightMode ? 'rgba(8, 145, 178, 0.42)' : 'rgba(6, 182, 212, 0.9)',
					shadowColor: LISTENING_CYAN,
					shadowOpacity: lightMode ? 0.12 : 0.3,
					shadowRadius: lightMode ? 10 : 18,
					iconColor: lightMode ? LIGHT_STARTING_ICON : '#FFFFFF',
					label: 'URUCHAMIAM...',
					labelColor: lightMode ? '#0E7490' : '#FFFFFF',
				}
			: micState === 'processing'
				? {
						backgroundColor: lightMode ? '#F3E8FF' : 'rgba(46, 16, 101, 0.92)',
						borderColor: lightMode
							? 'rgba(124, 58, 237, 0.38)'
							: 'rgba(139, 92, 246, 0.9)',
						shadowColor: PROCESSING_VIOLET,
						shadowOpacity: lightMode ? 0.16 : 0.42,
						shadowRadius: lightMode ? 14 : 24,
						iconColor: lightMode ? '#7C3AED' : '#FFFFFF',
						label: 'PRZETWARZAM...',
						labelColor: lightMode ? '#6D28D9' : '#FFFFFF',
					}
				: micState === 'listening'
					? {
							backgroundColor: lightMode ? '#ECFEFF' : 'rgba(8, 47, 73, 0.92)',
							borderColor: lightMode
								? 'rgba(8, 145, 178, 0.38)'
								: 'rgba(6, 182, 212, 0.9)',
							shadowColor: LISTENING_CYAN,
							shadowOpacity: lightMode ? 0.17 : 0.45,
							shadowRadius: lightMode ? 14 : 26,
							iconColor: lightMode ? '#0891B2' : '#FFFFFF',
							label: 'SŁUCHAM...',
							labelColor: lightMode ? '#0E7490' : '#FFFFFF',
						}
					: micState === 'unavailable'
						? {
								backgroundColor: lightMode ? '#FEF2F2' : 'rgba(69, 10, 10, 0.88)',
								borderColor: lightMode
									? 'rgba(220, 38, 38, 0.36)'
									: 'rgba(239, 68, 68, 0.8)',
								shadowColor: '#EF4444',
								shadowOpacity: lightMode ? 0.1 : 0.18,
								shadowRadius: lightMode ? 10 : 14,
								iconColor: lightMode ? '#DC2626' : '#FCA5A5',
								label: 'MOWA NIEDOSTĘPNA',
								labelColor: lightMode ? '#B91C1C' : '#FCA5A5',
							}
						: {
								backgroundColor: lightMode ? '#FFFFFF' : '#202028',
								borderColor: lightMode ? '#D4D4D8' : '#34313A',
								shadowColor: '#000000',
								shadowOpacity: 0,
								shadowRadius: 0,
								iconColor: lightMode ? '#3F3F46' : '#F0F0F0',
								label: 'Naciśnij, aby mówić',
								labelColor: lightMode ? '#52525B' : 'rgba(229, 231, 235, 0.58)',
							};
	const micLabel = isMicStarting
		? 'Uruchamiam...'
		: isMicProcessing
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
		borderColor: lightMode ? '#D4D4D8' : '#2A2D36',
		backgroundColor: lightMode ? '#FFFFFF' : '#1B1D25',
	};
	const panelBackdropStyle = {
		borderRadius: panelRadius,
		borderWidth: 1,
		borderColor: isHorizontal
			? lightMode
				? '#D4D4D8'
				: '#242833'
			: lightMode
				? 'rgba(30, 30, 30, 0.08)'
				: 'rgba(255, 255, 255, 0.06)',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: isHorizontal ? 10 : 4 },
		shadowOpacity: isHorizontal ? 0.22 : lightMode ? 0.08 : 0.13,
		shadowRadius: isHorizontal ? 22 : 10,
		elevation: isHorizontal ? 6 : 2,
		zIndex: 0,
		backgroundColor: lightMode
			? useEdgeToEdge
				? 'rgba(255, 255, 255, 0.94)'
				: isHorizontal
					? 'rgba(250, 250, 250, 0.96)'
					: 'rgba(255, 255, 255, 0.9)'
			: useEdgeToEdge
				? 'rgba(12, 14, 20, 0.84)'
				: isHorizontal
					? 'rgba(20, 22, 30, 0.92)'
					: 'rgba(20, 22, 30, 0.86)',
		bottom: useEdgeToEdge ? -4 : 0,
		...(useEdgeToEdge
			? {
					borderLeftWidth: 0,
					borderRightWidth: 0,
					borderBottomWidth: 0,
					borderTopLeftRadius: 0,
					borderTopRightRadius: 0,
				}
			: {}),
	};

	const renderSideButton = (type: 'camera' | 'writing') => {
		const isWritingButton = type === 'writing';
		const isDisabled = !isWritingButton;
		const isActive = isWritingButton && isWritingActive;

		return (
			<TouchableOpacity
				key={type}
				onPress={isWritingButton ? onWritingPress : undefined}
				disabled={isDisabled}
				activeOpacity={0.72}
				className='rounded-[12px] items-center justify-center'
				style={{
					...controlButtonStyle,
					width: sideButtonSize,
					height: sideButtonSize,
					backgroundColor: isDisabled
						? lightMode
							? '#F4F4F5'
							: '#161820'
						: isActive
							? lightMode
								? '#FFF7ED'
								: '#242028'
							: controlButtonStyle.backgroundColor,
					borderColor: isDisabled
						? lightMode
							? '#E4E4E7'
							: 'rgba(63, 68, 82, 0.42)'
						: isActive
							? 'rgba(255, 122, 0, 0.72)'
							: controlButtonStyle.borderColor,
					shadowColor: '#000000',
					shadowOffset: { width: 0, height: 0 },
					shadowOpacity: isActive ? 0.22 : 0,
					shadowRadius: isActive ? 10 : 0,
					elevation: isActive ? 4 : 0,
				}}>
				{isWritingButton ? (
					<MaterialCommunityIcons
						name='send'
						size={sideIconSize}
						color={isActive ? '#FF7A00' : lightMode ? '#52525B' : '#D4D4D8'}
					/>
				) : (
					<Image
						source={require('../assets/images/camera.png')}
						style={{
							width: sideIconSize,
							height: sideIconSize,
							opacity: 0.38,
							tintColor: lightMode ? '#71717A' : '#7A7F8C',
						}}
						resizeMode='contain'
					/>
				)}
				{isActive ? (
					<View
						className='absolute'
						style={{
							bottom: 9,
							width: 26,
							height: 3,
							borderRadius: 2,
							backgroundColor: '#FF7A00',
						}}
					/>
				) : null}
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
					elevation: micState === 'idle' ? (isHorizontal ? 5 : 2) : lightMode ? 5 : 10,
				}}>
				{isListening && !isMicStarting && !isMicProcessing ? <ListeningPulse /> : null}
				{isMicProcessing ? (
					<RotatingProcessingIcon color={micStyle.iconColor} size={centerIconSize} />
				) : (
					<>
						{isMicStarting ? (
							<MicStartingIndicator lightMode={lightMode} iconSize={centerIconSize} />
						) : (
							<Image
								source={require('../assets/images/micro.png')}
								style={{
									width: centerIconSize,
									height: centerIconSize,
									tintColor: micStyle.iconColor,
								}}
								resizeMode='contain'
							/>
						)}
						{isSpeechInputUnavailable ? (
							<View
								className='absolute items-center justify-center border'
								style={{
									left: 12,
									bottom: 12,
									width: 28,
									height: 28,
									borderRadius: 14,
									backgroundColor: lightMode ? '#FFFFFF' : '#3A1010',
									borderColor: lightMode ? '#FCA5A5' : '#EF4444',
								}}>
								<MaterialCommunityIcons
									name='microphone-off'
									size={18}
									color={lightMode ? '#DC2626' : '#EF4444'}
								/>
							</View>
						) : null}
						{isVoiceOutputUnavailable ? (
							<View
								className='absolute items-center justify-center border'
								style={{
									right: 12,
									bottom: 12,
									width: 28,
									height: 28,
									borderRadius: 14,
									backgroundColor: lightMode ? '#FFFFFF' : '#3A1010',
									borderColor: lightMode ? '#FCA5A5' : '#EF4444',
								}}>
								<MaterialCommunityIcons
									name='volume-off'
									size={18}
									color={lightMode ? '#DC2626' : '#EF4444'}
								/>
							</View>
						) : null}
					</>
				)}
			</TouchableOpacity>
			<View
				className='flex-row items-center justify-center'
				style={{ marginTop: isHorizontal ? (useEdgeToEdge ? 8 : 2) : 4 }}>
				{isListening && !isMicStarting && !isMicProcessing ? (
					<View className='w-1.5 h-1.5 rounded-full mr-2 bg-[#06B6D4]' />
				) : null}
				<Text
					className='text-center'
					style={{
						height: isHorizontal ? 14 : 13,
						color:
							micState === 'idle' && !isHorizontal
								? lightMode
									? '#71717A'
									: 'rgba(229, 231, 235, 0.5)'
								: micStyle.labelColor,
						fontSize: isHorizontal ? 11 : 10,
						lineHeight: isHorizontal ? 14 : 13,
						fontWeight: micState === 'idle' ? '500' : '700',
						letterSpacing: isHorizontal ? 0.8 : 0.2,
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
			{useEdgeToEdge ? (
				<View
					testID='control-panel-frosted-backdrop'
					pointerEvents='none'
					className='absolute inset-0 overflow-hidden'
					style={panelBackdropStyle}>
					<View
						testID='control-panel-frosted-haze'
						className='absolute inset-0'
						style={{
							backgroundColor: lightMode
								? 'rgba(255, 255, 255, 0.45)'
								: 'rgba(40, 48, 55, 0.25)',
						}}
					/>
					<View
						className='absolute left-0 right-0 top-0'
						style={{ height: 1, backgroundColor: 'rgba(255, 255, 255, 0.12)' }}
					/>
				</View>
			) : (
				<View
					testID='control-panel-solid-backdrop'
					pointerEvents='none'
					className='absolute inset-0 overflow-hidden'
					style={panelBackdropStyle}
				/>
			)}
			<View
				className={`${isHorizontal ? 'flex-row' : 'flex-col'} items-center px-3`}
				style={
					isHorizontal
						? {
								width: useEdgeToEdge ? horizontalControlsWidth : panelWidth,
								height: panelHeight,
								alignSelf: 'center',
								paddingVertical: 6,
								gap: 0,
								justifyContent: 'space-between',
								zIndex: 1,
							}
						: {
								width: panelWidth,
								height: panelHeight,
								paddingVertical: 34,
								zIndex: 1,
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
