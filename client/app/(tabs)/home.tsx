import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Animated,
	Image,
	Platform,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ServiceErrorModal from '@/components/ServiceErrorModal';
import VehicleCard, { type Vehicle } from '@/components/VehicleCard';
import VehicleFilters from '@/components/VehicleFilters';
import { useVehicleMetadata } from '@/hooks/use-vehicle-metadata';
import { CONFIG_SERVICE_FEATURE } from '@/utils/api-config';
import { AUTH_SERVICE_FEATURE } from '@/utils/auth-errors';

// --- CONFIGURATION & DATA TYPES ---

const PRIMARY_ORANGE = '#FF6B00';
const HARDCODED_DEVICE_ID = '1';

// --- MAIN SCREEN ---

export default function HomeScreen() {
	const router = useRouter();
	const { width: CURRENT_SCREEN_WIDTH, height: CURRENT_SCREEN_HEIGHT } = useWindowDimensions();
	const shortestScreenSide = Math.min(CURRENT_SCREEN_WIDTH, CURRENT_SCREEN_HEIGHT);
	const isTablet = shortestScreenSide >= 600;
	const isPortrait = CURRENT_SCREEN_HEIGHT > CURRENT_SCREEN_WIDTH;
	const useTabletHomeRefresh = isTablet;
	const insets = useSafeAreaInsets();
	const isWeb = Platform.OS === 'web';

	const [activeBrandFilter, setActiveBrandFilter] = useState<string>('WSZYSTKIE');
	const [activeTypeFilter, setActiveTypeFilter] = useState<string>('WSZYSTKIE');
	const [searchQuery] = useState<string>('');
	const [serviceErrorFeature, setServiceErrorFeature] = useState<string | null>(null);

	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		setServiceErrorFeature(featureName);
	}, []);

	const { brands, deviceTypes, rawDevices, isLoadingBrands, isLoadingTypes, isLoadingDevices } =
		useVehicleMetadata({ onServiceError: showServiceError });

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

	const openChat = (vehicle: Vehicle) => {
		const logoUrl = getRemoteBrandLogo(vehicle.brand);

		router.push({
			pathname: '/chat',
			params: {
				deviceId: HARDCODED_DEVICE_ID,
				deviceName: vehicle.name,
				chatSession: Date.now().toString(),
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

	const paddingHorizontal = useTabletHomeRefresh ? 20 : isWeb ? 16 : 8;
	const containerPadding = paddingHorizontal * 2;
	const cardMargin = useTabletHomeRefresh ? 12 : 16;

	let columns = 2;
	if (isWeb) {
		columns = Math.max(2, Math.floor((CURRENT_SCREEN_WIDTH - containerPadding) / 320));
	} else if (isTablet) {
		columns = isPortrait ? 2 : 3;
	}

	const cardWidth = (CURRENT_SCREEN_WIDTH - containerPadding) / columns - cardMargin;
	const cardHeight = useTabletHomeRefresh ? (isWeb ? 360 : 320) : isWeb ? 380 : cardWidth + 90;
	const imageHeight = useTabletHomeRefresh ? (isWeb ? 220 : 210) : isWeb ? 240 : cardWidth;
	const vehicleImageZoom = 1.02;

	const bottomListPadding = (insets.bottom || 0) + 32;

	const usePhonePortraitHeader = !isTablet && isPortrait;
	const useTabletFilterStyle = useTabletHomeRefresh || usePhonePortraitHeader;
	const useLargeHeaderTitle = isPortrait || isTablet;
	const headerLogoHeight = useTabletHomeRefresh
		? 40
		: usePhonePortraitHeader
			? 34
			: useLargeHeaderTitle
				? 50
				: 38;
	const headerLogoWidth = useTabletHomeRefresh
		? 68
		: usePhonePortraitHeader
			? 54
			: useLargeHeaderTitle
				? 80
				: 60;
	const headerTitleClassName = useTabletHomeRefresh
		? 'text-3xl'
		: usePhonePortraitHeader
			? 'text-2xl'
			: useLargeHeaderTitle
				? 'text-4xl'
				: 'text-2xl';
	const headerPaddingHorizontal = useTabletHomeRefresh ? 20 : isTablet ? 24 : 16;
	const headerPaddingVertical = useTabletHomeRefresh ? 10 : usePhonePortraitHeader ? 10 : 16;
	const headerTopRowHeight = useTabletHomeRefresh ? 44 : undefined;
	const titleGroupOffsetY = useTabletHomeRefresh ? 8 : 0;
	const headerButtonOffsetY = useTabletHomeRefresh ? 8 : 0;
	const useIconOnlyHeaderButtons = (isTablet && isPortrait) || usePhonePortraitHeader;
	const headerButtonHeight = useTabletHomeRefresh ? 44 : usePhonePortraitHeader ? 42 : 48;
	const headerButtonPaddingHorizontal = useIconOnlyHeaderButtons
		? 0
		: useTabletHomeRefresh
			? 16
			: 18;
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
						paddingHorizontal: headerPaddingHorizontal,
						paddingTop: headerPaddingVertical,
						paddingBottom: headerPaddingVertical,
						zIndex: 10,
						backgroundColor: '#09090b',
					}}>
					<View
						className={`flex-row justify-between items-center ${
							usePhonePortraitHeader ? 'gap-2' : 'gap-3'
						}`}
						style={{
							minHeight: headerTopRowHeight,
							marginBottom: useTabletHomeRefresh
								? 12
								: usePhonePortraitHeader
									? 12
									: 16,
						}}>
						<View
							className='flex-row items-center flex-1 min-w-0'
							style={{ transform: [{ translateY: titleGroupOffsetY }] }}>
							<Image
								source={require('../../assets/images/fixo3.png')}
								className={usePhonePortraitHeader ? 'mr-2' : 'mr-3'}
								style={{
									width: headerLogoWidth,
									height: headerLogoHeight,
								}}
								resizeMode='contain'
							/>
							<Text
								className={`${headerTitleClassName} text-white font-bold flex-1`}
								numberOfLines={1}
								adjustsFontSizeToFit>
								Wybierz Pojazd
							</Text>
						</View>
						<View
							className={`flex-row items-center ${usePhonePortraitHeader ? 'gap-2' : 'gap-3'}`}>
							<TouchableOpacity
								onPress={() => router.push('/settings')}
								accessibilityRole='button'
								accessibilityLabel='Ustawienia'
								className='flex-row items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#111111]'
								style={{
									height: headerButtonHeight,
									width: useIconOnlyHeaderButtons
										? headerButtonHeight
										: undefined,
									paddingHorizontal: headerButtonPaddingHorizontal,
									transform: [{ translateY: headerButtonOffsetY }],
								}}>
								<MaterialCommunityIcons
									name='cog-outline'
									size={21}
									color='#FF7A00'
								/>
								{useIconOnlyHeaderButtons ? null : (
									<Text className='text-[#E6E6E6] ml-4 text-[13px] font-semibold tracking-wider'>
										USTAWIENIA
									</Text>
								)}
							</TouchableOpacity>
							<TouchableOpacity
								onPress={() => router.push('/history')}
								accessibilityRole='button'
								accessibilityLabel='Historia czatów'
								className='flex-row items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#111111]'
								style={{
									height: headerButtonHeight,
									width: useIconOnlyHeaderButtons
										? headerButtonHeight
										: undefined,
									paddingHorizontal: headerButtonPaddingHorizontal,
									transform: [{ translateY: headerButtonOffsetY }],
								}}>
								<MaterialCommunityIcons name='history' size={21} color='#FF7A00' />
								{useIconOnlyHeaderButtons ? null : (
									<Text className='text-[#E6E6E6] ml-4 text-[13px] font-semibold tracking-wider'>
										HISTORIA CZATÓW
									</Text>
								)}
							</TouchableOpacity>
						</View>
					</View>

					<VehicleFilters
						brands={brands}
						deviceTypes={deviceTypes}
						activeBrandFilter={activeBrandFilter}
						activeTypeFilter={activeTypeFilter}
						onBrandFilterChange={setActiveBrandFilter}
						onTypeFilterChange={setActiveTypeFilter}
						useTabletRefresh={useTabletFilterStyle}
						isLoadingBrands={isLoadingBrands}
						isLoadingTypes={isLoadingTypes}
						primaryColor={PRIMARY_ORANGE}
					/>
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
						renderItem={({ item }) => (
							<VehicleCard
								vehicle={item}
								cardWidth={cardWidth}
								cardHeight={cardHeight}
								imageHeight={imageHeight}
								imageZoom={vehicleImageZoom}
								isTablet={isTablet}
								isWeb={isWeb}
								useTabletRefresh={useTabletHomeRefresh}
								onOpen={openChat}
								getBrandLogoUrl={getRemoteBrandLogo}
							/>
						)}
						ListEmptyComponent={
							<View className='w-full items-center justify-center px-6 py-12'>
								<MaterialCommunityIcons name='forklift' size={36} color='#71717A' />
								<Text className='text-gray-400 text-center mt-3'>
									Nie ma pojazdów pasujących do wybranych filtrów.
								</Text>
							</View>
						}
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

			<ServiceErrorModal
				visible={Boolean(serviceErrorFeature)}
				featureName={serviceErrorFeature || 'wybrana funkcja'}
				onClose={() => setServiceErrorFeature(null)}
				dismissible={
					serviceErrorFeature !== AUTH_SERVICE_FEATURE &&
					serviceErrorFeature !== CONFIG_SERVICE_FEATURE
				}
			/>
		</SafeAreaView>
	);
}
