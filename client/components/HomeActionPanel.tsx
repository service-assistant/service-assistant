import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const PRIMARY_ORANGE = '#FF6B00';
const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';
const SUCCESS_GREEN = '#22C55E';
const ERROR_RED = '#EF4444';

type MicUiState = 'idle' | 'listening' | 'processing' | 'success' | 'error' | 'disabled';

type HomeActionPanelProps = {
	isPortrait: boolean;
	isTablet: boolean;
	isWeb: boolean;
	onServiceError: (featureName: string, error: unknown) => void;
};

type HomeActionPanelMetrics = {
	gap: number;
	paddingHorizontal: number;
	paddingVertical: number;
	sideBtnSize: number;
	centerBtnSize: number;
	sideIconSize: number;
	centerIconSize: number;
	centerColumnWidth: number;
	panelWidth: number | undefined;
	panelHeight: number | undefined;
};

const MIC_STATE_STYLES: Record<
	MicUiState,
	{
		backgroundColor: string;
		borderColor: string;
		shadowColor: string;
		shadowOpacity: number;
		shadowRadius: number;
		iconColor: string;
		textColor: string;
		label: string;
	}
> = {
	idle: {
		backgroundColor: 'rgba(34, 34, 38, 0.9)',
		borderColor: 'rgba(255, 122, 0, 0.3)',
		shadowColor: PRIMARY_ORANGE,
		shadowOpacity: 0.1,
		shadowRadius: 10,
		iconColor: '#E8E8E8',
		textColor: 'rgba(229, 231, 235, 0.78)',
		label: 'Naciśnij żeby mówić',
	},
	listening: {
		backgroundColor: 'rgba(8, 47, 73, 0.92)',
		borderColor: 'rgba(6, 182, 212, 0.9)',
		shadowColor: LISTENING_CYAN,
		shadowOpacity: 0.45,
		shadowRadius: 26,
		iconColor: '#FFFFFF',
		textColor: '#FFFFFF',
		label: 'SŁUCHAM...',
	},
	processing: {
		backgroundColor: 'rgba(46, 16, 101, 0.92)',
		borderColor: 'rgba(139, 92, 246, 0.9)',
		shadowColor: PROCESSING_VIOLET,
		shadowOpacity: 0.42,
		shadowRadius: 24,
		iconColor: '#FFFFFF',
		textColor: '#FFFFFF',
		label: 'PRZETWARZAM...',
	},
	success: {
		backgroundColor: 'rgba(20, 83, 45, 0.92)',
		borderColor: 'rgba(34, 197, 94, 0.9)',
		shadowColor: SUCCESS_GREEN,
		shadowOpacity: 0.38,
		shadowRadius: 22,
		iconColor: '#FFFFFF',
		textColor: '#FFFFFF',
		label: 'ROZPOZNANO',
	},
	error: {
		backgroundColor: 'rgba(127, 29, 29, 0.92)',
		borderColor: 'rgba(239, 68, 68, 0.9)',
		shadowColor: ERROR_RED,
		shadowOpacity: 0.4,
		shadowRadius: 22,
		iconColor: '#FFFFFF',
		textColor: '#FFFFFF',
		label: 'NIE ROZPOZNANO',
	},
	disabled: {
		backgroundColor: 'rgba(39, 39, 42, 0.72)',
		borderColor: 'rgba(255, 255, 255, 0.08)',
		shadowColor: '#000000',
		shadowOpacity: 0.08,
		shadowRadius: 8,
		iconColor: '#A1A1AA',
		textColor: 'rgba(229, 231, 235, 0.5)',
		label: 'NIEDOSTĘPNE',
	},
};

export const getHomeActionPanelMetrics = (
	isPortrait: boolean,
	isTablet: boolean,
): HomeActionPanelMetrics => {
	const useLargeBottomBar = isPortrait || isTablet;

	return {
		gap: useLargeBottomBar ? 10 : 6,
		paddingHorizontal: useLargeBottomBar ? 18 : 12,
		paddingVertical: useLargeBottomBar ? 11 : 8,
		sideBtnSize: useLargeBottomBar ? 76 : 58,
		centerBtnSize: useLargeBottomBar ? 96 : 76,
		sideIconSize: useLargeBottomBar ? 34 : 26,
		centerIconSize: useLargeBottomBar ? 50 : 38,
		centerColumnWidth: useLargeBottomBar ? 140 : 120,
		panelWidth: isPortrait ? 344 : undefined,
		panelHeight: isPortrait ? 140 : undefined,
	};
};

export const getHomeActionPanelListPadding = ({
	isPortrait,
	isTablet,
	insetBottom,
}: {
	isPortrait: boolean;
	isTablet: boolean;
	insetBottom: number;
}) => {
	const metrics = getHomeActionPanelMetrics(isPortrait, isTablet);

	return (
		(metrics.panelHeight || metrics.centerBtnSize + metrics.paddingVertical * 2) +
		(insetBottom || 0) +
		96
	);
};

export default function HomeActionPanel({
	isPortrait,
	isTablet,
	isWeb,
	onServiceError,
}: HomeActionPanelProps) {
	const insets = useSafeAreaInsets();
	const [isListening, setIsListening] = useState(false);
	const [isCameraOpen, setIsCameraOpen] = useState(false);
	const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
	const [attachedPhotoUri, setAttachedPhotoUri] = useState<string | null>(null);
	const [cameraFlash, setCameraFlash] = useState<'off' | 'on'>('off');
	const [cameraPermission, requestCameraPermission] = useCameraPermissions();
	const listeningPulseAnim = useRef(new Animated.Value(0)).current;
	const cameraRef = useRef<any>(null);
	const bottomBar = getHomeActionPanelMetrics(isPortrait, isTablet);
	const bottomBarBlurProps =
		Platform.OS === 'android'
			? ({
					intensity: 10,
					blurReductionFactor: 4,
					experimentalBlurMethod: 'dimezisBlurView',
				} as const)
			: { intensity: isWeb ? 30 : 40 };
	const micUiState: MicUiState = isListening ? 'listening' : 'idle';
	const micStyle = MIC_STATE_STYLES[micUiState];
	const listeningPulseScale = listeningPulseAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [1, 1.18],
	});
	const listeningPulseOpacity = listeningPulseAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [0.26, 0.72],
	});

	useEffect(() => {
		if (!isListening) {
			listeningPulseAnim.stopAnimation();
			listeningPulseAnim.setValue(0);
			return;
		}

		const animation = Animated.loop(
			Animated.sequence([
				Animated.timing(listeningPulseAnim, {
					toValue: 1,
					duration: 700,
					useNativeDriver: true,
				}),
				Animated.timing(listeningPulseAnim, {
					toValue: 0,
					duration: 700,
					useNativeDriver: true,
				}),
			]),
		);

		animation.start();
		return () => animation.stop();
	}, [isListening, listeningPulseAnim]);

	const onMicPress = () => {
		if (Platform.OS !== 'web') {
			void Haptics.selectionAsync();
		}

		setIsListening((current) => !current);
	};

	const openCamera = async () => {
		try {
			const permission = cameraPermission?.granted
				? cameraPermission
				: await requestCameraPermission();

			if (!permission.granted) return;

			setCapturedPhotoUri(null);
			setIsCameraOpen(true);
		} catch (error) {
			console.log('Handled camera open error:', error);
			onServiceError('kamera', error);
		}
	};

	const closeCamera = () => {
		setCapturedPhotoUri(null);
		setIsCameraOpen(false);
	};

	const takePhoto = async () => {
		try {
			const photo = await cameraRef.current?.takePictureAsync?.({
				quality: 0.75,
				skipProcessing: true,
				shutterSound: false,
				flash: cameraFlash,
			});

			if (photo?.uri) {
				setCapturedPhotoUri(photo.uri);
			}
		} catch (error) {
			console.log('Handled camera capture error:', error);
			onServiceError('kamera', error);
		}
	};

	const attachPhoto = () => {
		if (capturedPhotoUri) {
			setAttachedPhotoUri(capturedPhotoUri);
		}
		closeCamera();
	};

	return (
		<>
			<View
				style={{
					pointerEvents: 'box-none',
					bottom: insets.bottom > 0 ? insets.bottom + 14 : 24,
				}}
				className='absolute left-0 right-0 w-full items-center z-50'>
				<View
					className='relative'
					style={{
						width: bottomBar.panelWidth,
						height: bottomBar.panelHeight,
					}}>
					<BlurView
						{...bottomBarBlurProps}
						tint='dark'
						pointerEvents='none'
						className='absolute inset-0 overflow-hidden'
						style={{
							borderRadius: 100,
							borderWidth: 1,
							borderColor: 'rgba(255, 122, 0, 0.18)',
							shadowColor: '#000',
							shadowOffset: { width: 0, height: 12 },
							shadowOpacity: 0.45,
							shadowRadius: 36,
							elevation: 12,
							zIndex: 0,
							backgroundColor:
								Platform.OS === 'android'
									? 'rgba(18, 18, 22, 0.82)'
									: 'rgba(24, 24, 28, 0.76)',
						}}
					/>
					<View
						className='flex-row items-center justify-center'
						style={{
							width: bottomBar.panelWidth,
							height: bottomBar.panelHeight,
							paddingHorizontal: bottomBar.paddingHorizontal,
							paddingVertical: bottomBar.paddingVertical,
							gap: bottomBar.gap,
							zIndex: 1,
							justifyContent: 'center',
						}}>
						<TouchableOpacity
							onPress={openCamera}
							className='rounded-[12px] items-center justify-center'
							style={{
								width: bottomBar.sideBtnSize,
								height: bottomBar.sideBtnSize,
								backgroundColor: 'rgba(31, 31, 36, 0.88)',
								borderWidth: 1,
								borderColor: attachedPhotoUri
									? 'rgba(255, 122, 0, 0.75)'
									: 'rgba(255, 255, 255, 0.08)',
							}}>
							<Image
								source={require('../assets/images/camera.png')}
								style={{
									width: bottomBar.sideIconSize,
									height: bottomBar.sideIconSize,
									tintColor: '#D4D4D8',
								}}
							/>
							{attachedPhotoUri ? (
								<View className='absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#FF6B00]' />
							) : null}
						</TouchableOpacity>

						<View
							className='items-center flex-col gap-2'
							style={{ width: bottomBar.centerColumnWidth }}>
							<TouchableOpacity
								onPressIn={onMicPress}
								className='rounded-[12px] items-center justify-center'
								style={{
									width: bottomBar.centerBtnSize,
									height: bottomBar.centerBtnSize,
									backgroundColor: micStyle.backgroundColor,
									borderWidth: 1,
									borderColor: micStyle.borderColor,
									shadowColor: micStyle.shadowColor,
									shadowOffset: { width: 0, height: 0 },
									shadowOpacity: micStyle.shadowOpacity,
									shadowRadius: micStyle.shadowRadius,
									elevation: micUiState === 'idle' ? 5 : 10,
								}}>
								{micUiState === 'listening' ? (
									<Animated.View
										pointerEvents='none'
										style={{
											position: 'absolute',
											top: 0,
											bottom: 0,
											left: 0,
											right: 0,
											borderRadius: 12,
											borderWidth: 1,
											borderColor: LISTENING_CYAN,
											backgroundColor: 'rgba(6, 182, 212, 0.14)',
											opacity: listeningPulseOpacity,
											transform: [{ scale: listeningPulseScale }],
										}}
									/>
								) : null}
								<Image
									source={require('../assets/images/micro.png')}
									style={{
										width: bottomBar.centerIconSize,
										height: bottomBar.centerIconSize,
										tintColor: micStyle.iconColor,
									}}
									resizeMode='contain'
								/>
							</TouchableOpacity>
							<View className='flex-row items-center justify-center mt-1'>
								{micUiState === 'listening' ? (
									<View
										className='w-1.5 h-1.5 rounded-full mr-2'
										style={{ backgroundColor: LISTENING_CYAN }}
									/>
								) : null}
								<Text
									className='text-center text-[11px] font-bold'
									style={{
										width: bottomBar.centerColumnWidth,
										height: 14,
										fontSize: 11,
										lineHeight: 14,
										letterSpacing: 0.8,
										color: micStyle.textColor,
										textShadowColor: 'rgba(0, 0, 0, 0.8)',
										textShadowOffset: { width: 0, height: 1 },
										textShadowRadius: 3,
									}}
									numberOfLines={1}>
									{micStyle.label}
								</Text>
							</View>
						</View>

						<TouchableOpacity
							className='rounded-[12px] items-center justify-center'
							style={{
								width: bottomBar.sideBtnSize,
								height: bottomBar.sideBtnSize,
								backgroundColor: 'rgba(31, 31, 36, 0.88)',
								borderWidth: 1,
								borderColor: 'rgba(255, 255, 255, 0.08)',
							}}>
							<Image
								source={require('../assets/images/search.png')}
								style={{
									width: bottomBar.sideIconSize,
									height: bottomBar.sideIconSize,
									tintColor: '#D4D4D8',
								}}
							/>
						</TouchableOpacity>
					</View>
				</View>
			</View>

			{isCameraOpen ? (
				<View className='absolute inset-0 bg-black z-[100]'>
					<SafeAreaView className='flex-1' edges={['top', 'left', 'right']}>
						<View
							className='absolute left-4 flex-row gap-3 z-10'
							style={{ top: Math.max(insets.top, 18) + 18 }}>
							<TouchableOpacity
								onPress={closeCamera}
								className='w-12 h-12 rounded-full bg-black/70 border border-white/20 items-center justify-center'>
								<Text className='text-white text-2xl leading-7'>×</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={() =>
									setCameraFlash((flash) => (flash === 'on' ? 'off' : 'on'))
								}
								className='w-12 h-12 rounded-full bg-black/70 border border-white/20 items-center justify-center'>
								<MaterialCommunityIcons
									name={cameraFlash === 'on' ? 'flash' : 'flash-off'}
									size={24}
									color={cameraFlash === 'on' ? PRIMARY_ORANGE : '#FFFFFF'}
								/>
							</TouchableOpacity>
						</View>

						<View className='flex-1 items-center justify-center px-4 pb-28 pt-16'>
							<View
								className='w-full overflow-hidden bg-[#111] border border-white/10'
								style={{
									aspectRatio: 3 / 4,
									maxHeight: isTablet ? 760 : 560,
									borderRadius: 18,
								}}>
								{capturedPhotoUri ? (
									<Image
										source={{ uri: capturedPhotoUri }}
										style={{ width: '100%', height: '100%' }}
										resizeMode='cover'
									/>
								) : (
									<CameraView
										ref={cameraRef}
										style={{ flex: 1 }}
										facing='back'
										flash={cameraFlash}
									/>
								)}
							</View>
						</View>

						<View
							className='absolute left-0 right-0 items-center px-5'
							style={{ bottom: insets.bottom > 0 ? insets.bottom + 34 : 44 }}>
							{capturedPhotoUri ? (
								<View className='w-full flex-row justify-center gap-3'>
									<TouchableOpacity
										onPress={() => setCapturedPhotoUri(null)}
										className='h-14 px-5 rounded-[12px] bg-[#1F1F24]/95 border border-white/10 items-center justify-center'>
										<Text className='text-white font-bold text-[13px] uppercase'>
											Zrób ponownie
										</Text>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={attachPhoto}
										className='h-14 px-7 rounded-[12px] bg-[#FF6B00] items-center justify-center'>
										<Text className='text-white font-bold text-[13px] uppercase'>
											Dołącz
										</Text>
									</TouchableOpacity>
								</View>
							) : (
								<TouchableOpacity
									onPress={takePhoto}
									className='w-20 h-20 rounded-full bg-white/95 border-[6px] border-[#FF6B00] items-center justify-center'>
									<View className='w-12 h-12 rounded-full bg-white' />
								</TouchableOpacity>
							)}
						</View>
					</SafeAreaView>
				</View>
			) : null}
		</>
	);
}
