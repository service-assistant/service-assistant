import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Animated,
	Image,
	ImageSourcePropType,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// --- CONFIGURATION & DATA TYPES ---

type Brand = {
	id: number;
	name: string;
	logo_url: string;
	created_at: string;
	updated_at: string;
};

type DeviceType = {
	id: number;
	name: string;
	created_at: string;
	updated_at: string;
};

// Raw device data directly from API
type DeviceRaw = {
	id: number;
	brand_id: number;
	device_type_id: number;
	name: string;
	model_serial_code: string;
	image_url: string;
	created_at: string;
	updated_at: string;
};

// Unified type used by the UI
type Vehicle = {
	id: string;
	name: string;
	brand: string;
	type: string;
	imageUrl: ImageSourcePropType;
	imageOffsetY: number;
	imageZoom: number;
};

const PRIMARY_ORANGE = '#FF6B00';
const LISTENING_CYAN = '#06B6D4';
const PROCESSING_VIOLET = '#8B5CF6';
const SUCCESS_GREEN = '#22C55E';
const ERROR_RED = '#EF4444';

type MicUiState = 'idle' | 'listening' | 'processing' | 'success' | 'error' | 'disabled';

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
		label: 'NACIĹšNIJ Ĺ»EBY MĂ“WIÄ†',
	},
	listening: {
		backgroundColor: 'rgba(8, 47, 73, 0.92)',
		borderColor: 'rgba(6, 182, 212, 0.9)',
		shadowColor: LISTENING_CYAN,
		shadowOpacity: 0.45,
		shadowRadius: 26,
		iconColor: '#FFFFFF',
		textColor: '#FFFFFF',
		label: 'SĹUCHAM...',
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
		label: 'NIEDOSTÄPNE',
	},
};

const FILTER_LOGO_SIZES: Record<string, { width: number; height: number }> = {
	TOYOTA: { width: 96, height: 26 },
	DIECI: { width: 72, height: 26 },
	UNICARRIERS: { width: 132, height: 26 },
	TCM: { width: 60, height: 26 },
	STILL: { width: 60, height: 26 },
	JUNGHEINRICH: { width: 132, height: 26 },
	DEFAULT: { width: 84, height: 26 },
};

// --- HELPER COMPONENTS ---

const BrandLogoOrText: React.FC<{ brandName: string; logoUrl: string | null; active: boolean }> = ({
	brandName,
	logoUrl,
	active,
}) => {
	const [imageError, setImageError] = useState(false);

	const textStyle =
		Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {};

	if (brandName === 'WSZYSTKIE') {
		return (
			<Text
				className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
				style={textStyle as any}>
				{brandName}
			</Text>
		);
	}

	if (logoUrl && !imageError) {
		const dims = FILTER_LOGO_SIZES[brandName.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;
		return (
			<Image
				source={{ uri: logoUrl }}
				style={{ width: dims.width, height: dims.height }}
				resizeMode='contain'
				onError={() => setImageError(true)}
			/>
		);
	}

	return (
		<Text
			className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
			style={textStyle as any}>
			{brandName.toUpperCase()}
		</Text>
	);
};

// --- MAIN SCREEN ---

export default function HomeScreen() {
	const router = useRouter();
	const { width: CURRENT_SCREEN_WIDTH } = useWindowDimensions();
	const isTablet = CURRENT_SCREEN_WIDTH >= 768;
	const insets = useSafeAreaInsets();
	const isWeb = Platform.OS === 'web';

	const [activeBrandFilter, setActiveBrandFilter] = useState<string>('WSZYSTKIE');
	const [activeTypeFilter, setActiveTypeFilter] = useState<string>('WSZYSTKIE');
	const [searchQuery, setSearchQuery] = useState<string>('');
	const [isListening, setIsListening] = useState(false);
	const [isCameraOpen, setIsCameraOpen] = useState(false);
	const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
	const [attachedPhotoUri, setAttachedPhotoUri] = useState<string | null>(null);
	const [cameraFlash, setCameraFlash] = useState<'off' | 'on'>('off');
	const [cameraPermission, requestCameraPermission] = useCameraPermissions();
	const listeningPulseAnim = useRef(new Animated.Value(0)).current;
	const cameraRef = useRef<any>(null);

	// --- API STATES ---
	const [brands, setBrands] = useState<Brand[]>([]);
	const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
	const [rawDevices, setRawDevices] = useState<DeviceRaw[]>([]);

	const [isLoadingBrands, setIsLoadingBrands] = useState(true);
	const [isLoadingTypes, setIsLoadingTypes] = useState(true);
	const [isLoadingDevices, setIsLoadingDevices] = useState(true);

	const API_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN;

	// --- FETCH DATA FROM API ---
	useEffect(() => {
		const fetchBrands = async () => {
			try {
				const response = await fetch('https://staging.asystent-serwisanta.pl/api/brands', {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${API_TOKEN}`,
						Accept: 'application/json',
					},
				});
				if (!response.ok) throw new Error(`Brands API error: ${response.status}`);
				const data: Brand[] = await response.json();
				setBrands(data);
			} catch (error) {
				console.error('Failed to fetch brands:', error);
			} finally {
				setIsLoadingBrands(false);
			}
		};

		const fetchDeviceTypes = async () => {
			try {
				const response = await fetch(
					'https://staging.asystent-serwisanta.pl/api/device_types',
					{
						method: 'GET',
						headers: {
							Authorization: `Bearer ${API_TOKEN}`,
							Accept: 'application/json',
						},
					},
				);
				if (!response.ok) throw new Error(`Types API error: ${response.status}`);
				const data: DeviceType[] = await response.json();
				setDeviceTypes(data);
			} catch (error) {
				console.error('Failed to fetch device types:', error);
			} finally {
				setIsLoadingTypes(false);
			}
		};

		const fetchDevices = async () => {
			try {
				const response = await fetch('https://staging.asystent-serwisanta.pl/api/devices', {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${API_TOKEN}`,
						Accept: 'application/json',
					},
				});
				if (!response.ok) throw new Error(`Devices API error: ${response.status}`);
				const data: DeviceRaw[] = await response.json();
				setRawDevices(data);
			} catch (error) {
				console.error('Failed to fetch devices:', error);
			} finally {
				setIsLoadingDevices(false);
			}
		};

		fetchBrands();
		fetchDeviceTypes();
		fetchDevices();
	}, []);

	// --- MAP DEVICES TO UI FORMAT ---
	const mappedVehicles: Vehicle[] = rawDevices.map((device) => {
		const brand = brands.find((b) => b.id === device.brand_id);
		const type = deviceTypes.find((dt) => dt.id === device.device_type_id);

		return {
			id: device.id.toString(),
			name: device.name,
			brand: brand ? brand.name : 'NIEZNANA MARKA',
			type: type ? type.name : 'NIEZNANY TYP',
			imageUrl: device.image_url
				? { uri: device.image_url }
				: require('../../assets/images/fixo3.png'), // Fallback if image is missing
			imageOffsetY: 0, // Default values, API images are not manually calibrated
			imageZoom: 1.0,
		};
	});

	const getRemoteBrandLogo = (brandName: string): string | null => {
		const brand = brands.find((b) => b.name.toLowerCase() === brandName.toLowerCase());
		return brand ? brand.logo_url : null;
	};

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

		setIsListening(!isListening);
	};

	const openCamera = async () => {
		const permission = cameraPermission?.granted
			? cameraPermission
			: await requestCameraPermission();

		if (!permission.granted) return;

		setCapturedPhotoUri(null);
		setIsCameraOpen(true);
	};

	const closeCamera = () => {
		setCapturedPhotoUri(null);
		setIsCameraOpen(false);
	};

	const takePhoto = async () => {
		const photo = await cameraRef.current?.takePictureAsync?.({
			quality: 0.75,
			skipProcessing: true,
			shutterSound: false,
			flash: cameraFlash,
		});

		if (photo?.uri) {
			setCapturedPhotoUri(photo.uri);
		}
	};

	const attachPhoto = () => {
		if (capturedPhotoUri) {
			setAttachedPhotoUri(capturedPhotoUri);
		}
		closeCamera();
	};

	const openChat = (vehicle: Vehicle) => {
		const logoUrl = getRemoteBrandLogo(vehicle.brand);

		router.push({
			pathname: '/chat',
			params: {
				deviceId: vehicle.id,
				deviceName: vehicle.name,
				...(logoUrl ? { logoUrl } : {}),
			},
		});
	};

	const [headerHeight, setHeaderHeight] = useState(0);
	const scrollY = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		if (isWeb) {
			scrollY.setValue(0);
		}
	}, [CURRENT_SCREEN_WIDTH, isWeb, scrollY]);

	const headerTranslateY = scrollY.interpolate({
		inputRange: [0, headerHeight || 1],
		outputRange: [0, -(headerHeight || 1)],
		extrapolate: 'clamp',
	});

	const headerOpacity = scrollY.interpolate({
		inputRange: [0, headerHeight || 1],
		outputRange: [1, 0],
		extrapolate: 'clamp',
	});

	const filteredVehicles = mappedVehicles.filter((v) => {
		const mBrand =
			activeBrandFilter === 'WSZYSTKIE' ||
			v.brand.toUpperCase() === activeBrandFilter.toUpperCase();
		const mType =
			activeTypeFilter === 'WSZYSTKIE' ||
			v.type.toLowerCase() === activeTypeFilter.toLowerCase();
		const mSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
		return mBrand && mType && mSearch;
	});

	const paddingHorizontal = isTablet || isWeb ? 16 : 8;
	const containerPadding = paddingHorizontal * 2;
	const cardMargin = 16;

	let columns = 2;
	if (isWeb) {
		columns = Math.max(2, Math.floor((CURRENT_SCREEN_WIDTH - containerPadding) / 320));
	} else if (isTablet) {
		columns = 3;
	}

	const cardWidth = (CURRENT_SCREEN_WIDTH - containerPadding) / columns - cardMargin;
	const cardHeight = isWeb ? 380 : isTablet ? 340 : cardWidth + 90;
	const imageHeight = isWeb || isTablet ? 240 : cardWidth;
	const vehicleImageZoom = 1.02;

	const renderCardInfo = (vehicle: Vehicle, isTabletSize: boolean) => {
		const logoUrl = getRemoteBrandLogo(vehicle.brand);
		const logoHeight = isTabletSize || isWeb ? 24 : 20;

		const brandToRemove = vehicle.brand.toLowerCase() + ' ';
		const cleanName = vehicle.name.toLowerCase().startsWith(brandToRemove)
			? vehicle.name.substring(brandToRemove.length)
			: vehicle.name;

		if (isWeb) {
			const logoDims =
				FILTER_LOGO_SIZES[vehicle.brand.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;

			return (
				<View className='w-full flex-row items-center justify-center mb-4 px-2'>
					{logoUrl && (
						<Image
							source={{ uri: logoUrl }}
							style={{
								height: logoHeight,
								width: logoDims.width,
								marginRight: 12,
							}}
							resizeMode='contain'
						/>
					)}
					<Text className='text-white font-bold text-xl' numberOfLines={1}>
						{cleanName.toUpperCase()}
					</Text>
				</View>
			);
		}

		return (
			<View className='w-full items-center justify-center p-3'>
				{logoUrl && (
					<View style={{ width: '100%', height: logoHeight, marginBottom: 8 }}>
						<Image
							source={{ uri: logoUrl }}
							style={{ width: '100%', height: '100%' }}
							resizeMode='contain'
						/>
					</View>
				)}
				<Text
					className={`text-white font-bold text-center ${isTabletSize ? 'text-xl' : 'text-lg'}`}
					numberOfLines={1}
					adjustsFontSizeToFit>
					{cleanName.toUpperCase()}
				</Text>
			</View>
		);
	};

	const renderVehicleCard = ({ item }: { item: Vehicle }) => {
		return (
			<TouchableOpacity
				activeOpacity={isWeb ? 1 : 0.9}
				onPress={isWeb ? undefined : () => openChat(item)}
				className='bg-[#18181b] rounded-[24px] m-2 overflow-hidden flex-col'
				style={
					{
						width: cardWidth,
						height: cardHeight,
						...(isWeb ? { cursor: 'default' } : {}),
					} as any
				}>
				<View
					className='w-full items-center justify-center bg-[#27272a] overflow-hidden'
					style={{ height: imageHeight, position: 'relative' }}>
					<Image
						source={item.imageUrl}
						style={{
							position: 'absolute',
							width: '100%',
							height: '100%',
							transform: [
								{ scale: vehicleImageZoom * item.imageZoom },
								{ translateY: item.imageOffsetY },
							],
						}}
						resizeMode='cover'
					/>
				</View>

				<View
					className={`bg-[#18181b] flex-1 p-4 border-t border-[#3f3f46] justify-center items-center`}>
					{renderCardInfo(item, isTablet)}

					{isWeb && (
						<TouchableOpacity
							onPress={() => openChat(item)}
							style={{ backgroundColor: PRIMARY_ORANGE }}
							className='w-full py-4 rounded-[16px] flex-row justify-center items-center mt-1 z-10'>
							<Text className='text-white font-bold text-[15px]'>WYBIERZ</Text>
						</TouchableOpacity>
					)}
				</View>
			</TouchableOpacity>
		);
	};

	const bottomBar = {
		gap: isTablet ? 10 : 6,
		paddingHorizontal: isTablet ? 18 : 12,
		paddingVertical: isTablet ? 11 : 8,
		sideBtnSize: isTablet ? 76 : 58,
		centerBtnSize: isTablet ? 96 : 76,
		sideIconSize: isTablet ? 34 : 26,
		centerIconSize: isTablet ? 50 : 38,
	};
	const bottomBarBlurProps =
		Platform.OS === 'android'
			? ({
					intensity: 35,
					blurReductionFactor: 4,
					experimentalBlurMethod: 'dimezisBlurView',
				} as const)
			: { intensity: isWeb ? 30 : 40 };
	const micUiState: MicUiState = isListening ? 'listening' : 'idle';
	const micStyle = MIC_STATE_STYLES[micUiState];
	const bottomListPadding =
		bottomBar.centerBtnSize + bottomBar.paddingVertical * 2 + (insets.bottom || 0) + 96;
	const listeningPulseScale = listeningPulseAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [1, 1.18],
	});
	const listeningPulseOpacity = listeningPulseAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [0.26, 0.72],
	});

	const brandFilterOptions = [{ name: 'WSZYSTKIE', logo_url: null }, ...brands];
	const typeFilterOptions = [{ name: 'WSZYSTKIE' }, ...deviceTypes];

	return (
		<SafeAreaView className='flex-1 bg-[#09090b]' edges={['top', 'left', 'right']}>
			<View className='flex-1'>
				<Animated.View
					onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
					style={{
						opacity: headerOpacity,
						transform: [{ translateY: headerTranslateY }],
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						paddingHorizontal: isTablet ? 24 : 16,
						paddingTop: 16,
						paddingBottom: 16,
						zIndex: 10,
						backgroundColor: '#09090b',
					}}>
					<View className='flex-row justify-between items-center mb-4'>
						<View className='flex-row items-center'>
							<Image
								source={require('../../assets/images/fixo3.png')}
								className='mr-3'
								style={{ width: isTablet ? 80 : 60, height: isTablet ? 50 : 38 }}
								resizeMode='contain'
							/>
							<Text
								className={`${
									isTablet ? 'text-4xl' : 'text-2xl'
								} text-white font-bold`}>
								Wybierz Pojazd
							</Text>
						</View>
					</View>

					<View className='mb-3'>
						<Text className='text-gray-400 text-sm font-bold uppercase tracking-widest ml-2 mb-2'>
							Marka
						</Text>
						{isLoadingBrands ? (
							<ActivityIndicator
								size='small'
								color={PRIMARY_ORANGE}
								style={{
									alignSelf: 'flex-start',
									marginVertical: 12,
									marginLeft: 8,
								}}
							/>
						) : (
							<ScrollView horizontal showsHorizontalScrollIndicator={false}>
								{brandFilterOptions.map((brandObj) => (
									<TouchableOpacity
										key={brandObj.name}
										onPress={() => setActiveBrandFilter(brandObj.name)}
										style={{
											backgroundColor:
												activeBrandFilter === brandObj.name
													? PRIMARY_ORANGE
													: '#27272a',
										}}
										className='px-6 py-3 rounded-full mr-4 min-h-[48px] justify-center items-center flex-row'>
										<BrandLogoOrText
											brandName={brandObj.name}
											logoUrl={brandObj.logo_url}
											active={activeBrandFilter === brandObj.name}
										/>
									</TouchableOpacity>
								))}
							</ScrollView>
						)}
					</View>

					<View className='mb-0'>
						<Text className='text-gray-400 text-sm font-bold uppercase tracking-widest ml-2 mb-2'>
							Typ
						</Text>
						{isLoadingTypes ? (
							<ActivityIndicator
								size='small'
								color={PRIMARY_ORANGE}
								style={{
									alignSelf: 'flex-start',
									marginVertical: 12,
									marginLeft: 8,
								}}
							/>
						) : (
							<ScrollView horizontal showsHorizontalScrollIndicator={false}>
								{typeFilterOptions.map((typeObj) => (
									<TouchableOpacity
										key={typeObj.name}
										onPress={() => setActiveTypeFilter(typeObj.name)}
										style={{
											backgroundColor:
												activeTypeFilter === typeObj.name
													? PRIMARY_ORANGE
													: '#27272a',
										}}
										className='px-6 py-3 rounded-full mr-4 min-h-[48px] justify-center items-center flex-row'>
										<Text
											className={`text-sm font-bold uppercase ${
												activeTypeFilter === typeObj.name
													? 'text-white'
													: 'text-gray-300'
											}`}
											style={
												Platform.OS === 'android'
													? {
															includeFontPadding: false,
															textAlignVertical: 'center',
														}
													: {}
											}>
											{typeObj.name}
										</Text>
									</TouchableOpacity>
								))}
							</ScrollView>
						)}
					</View>
				</Animated.View>

				{isLoadingDevices ? (
					<View
						className='flex-1 justify-center items-center'
						style={{ paddingTop: headerHeight + 50 }}>
						<ActivityIndicator size='large' color={PRIMARY_ORANGE} />
						<Text className='text-gray-400 mt-4'>Ĺadowanie maszyn...</Text>
					</View>
				) : (
					<Animated.FlatList
						key={`grid-${columns}`}
						data={filteredVehicles}
						keyExtractor={(item) => item.id}
						renderItem={renderVehicleCard}
						numColumns={columns}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{
							paddingTop: headerHeight,
							paddingBottom: bottomListPadding,
							paddingHorizontal: paddingHorizontal,
							alignItems: 'center',
						}}
						onScroll={Animated.event(
							[{ nativeEvent: { contentOffset: { y: scrollY } } }],
							{
								useNativeDriver: !isWeb,
							},
						)}
						scrollEventThrottle={16}
					/>
				)}
			</View>

			<View
				style={{
					pointerEvents: 'box-none',
					bottom: insets.bottom > 0 ? insets.bottom + 14 : 24,
				}}
				className='absolute left-0 right-0 w-full items-center z-50'>
				<BlurView
					{...bottomBarBlurProps}
					tint='dark'
					className='flex-row items-center justify-center overflow-hidden'
					style={{
						borderRadius: 100,
						borderWidth: 1,
						borderColor: 'rgba(255, 122, 0, 0.18)',
						paddingHorizontal: bottomBar.paddingHorizontal,
						paddingVertical: bottomBar.paddingVertical,
						gap: bottomBar.gap,
						shadowColor: '#000',
						shadowOffset: { width: 0, height: 12 },
						shadowOpacity: 0.45,
						shadowRadius: 36,
						elevation: 12,
						backgroundColor:
							Platform.OS === 'android'
								? 'rgba(18, 18, 22, 0.82)'
								: 'rgba(24, 24, 28, 0.76)',
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
							source={require('../../assets/images/camera.png')}
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
						style={{ width: isTablet ? 140 : 120 }}>
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
									className='absolute top-0 bottom-0 left-0 right-0 rounded-[12px]'
									style={{
										borderWidth: 1,
										borderColor: LISTENING_CYAN,
										backgroundColor: 'rgba(6, 182, 212, 0.14)',
										opacity: listeningPulseOpacity,
										transform: [{ scale: listeningPulseScale }],
									}}
								/>
							) : null}
							<Image
								source={require('../../assets/images/micro.png')}
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
								className='text-center text-[11px] sm:text-xs font-bold'
								style={{
									letterSpacing: 0.8,
									color: micStyle.textColor,
									textShadowColor: 'rgba(0, 0, 0, 0.8)',
									textShadowOffset: { width: 0, height: 1 },
									textShadowRadius: 3,
								}}
								numberOfLines={1}
								adjustsFontSizeToFit>
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
							source={require('../../assets/images/search.png')}
							style={{
								width: bottomBar.sideIconSize,
								height: bottomBar.sideIconSize,
								tintColor: '#D4D4D8',
							}}
						/>
					</TouchableOpacity>
				</BlurView>
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
		</SafeAreaView>
	);
}
