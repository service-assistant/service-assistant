import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	Platform,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import NameplateScannerModal from '@/components/NameplateScannerModal';
import ServiceErrorModal from '@/components/ServiceErrorModal';
import ThemeAwareLogo from '@/components/ThemeAwareLogo';
import VehicleCard, { type Vehicle } from '@/components/VehicleCard';
import VehicleFilters from '@/components/VehicleFilters';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useVehicleMetadata } from '@/hooks/use-vehicle-metadata';
import type { NameplateDeviceCandidate, NameplateRecognition } from '@/types/nameplate';
import { CONFIG_SERVICE_FEATURE } from '@/utils/api-config';
import { AUTH_SERVICE_FEATURE } from '@/utils/auth-errors';
import { createNameplateThread } from '@/utils/nameplate-api';
import { isTransientNetworkError } from '@/utils/network';

// --- CONFIGURATION & DATA TYPES ---

const PRIMARY_ORANGE = '#FF6B00';

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
	const { reconnectCount } = useNetworkStatus();

	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		if (isTransientNetworkError(error)) return;
		setServiceErrorFeature(featureName);
	}, []);

	const { brands, deviceTypes, rawDevices, isLoadingBrands, isLoadingTypes, isLoadingDevices } =
		useVehicleMetadata({ onServiceError: showServiceError, refreshKey: reconnectCount });
	const [isNameplateScannerOpen, setIsNameplateScannerOpen] = useState(false);

	// --- MAP DEVICES TO UI FORMAT ---
	const mappedVehicles: Vehicle[] = rawDevices.map((device) => {
		const brand = brands.find((b) => b.id === device.brand_id);
		const type = deviceTypes.find((dt) => dt.id === device.device_type_id);

		return {
			id: device.id.toString(),
			name: device.name,
			brand: brand ? brand.name : 'NIEZNANA MARKA',
			type: type ? type.name : 'NIEZNANY TYP',
			imageUrl: device.image_url?.trim() ? { uri: device.image_url } : undefined,
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
				deviceId: vehicle.id,
				deviceName: vehicle.name,
				chatSession: Date.now().toString(),
				...(logoUrl ? { logoUrl } : {}),
			},
		});
	};

	const openRecognizedVehicle = async (
		recognition: NameplateRecognition,
		device: NameplateDeviceCandidate,
	) => {
		const vehicle = mappedVehicles.find((candidate) => candidate.id === String(device.id));
		if (!vehicle) {
			throw new Error('Rozpoznany pojazd nie jest dostępny na liście.');
		}
		const thread = await createNameplateThread({
			device,
			nameplateData: recognition.nameplate_data,
		});
		const logoUrl = getRemoteBrandLogo(vehicle.brand);
		router.push({
			pathname: '/chat',
			params: {
				deviceId: vehicle.id,
				deviceName: vehicle.name,
				threadId: String(thread.id),
				chatSession: `nameplate-${thread.id}`,
				...(logoUrl ? { logoUrl } : {}),
			},
		});
	};

	const { lightThemeEnabled } = useAppSettings();

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

	const scanButtonSize = isTablet ? 112 : 96;
	const scanButtonBottom = (insets.bottom || 0) + 16;
	const bottomListPadding = scanButtonBottom + scanButtonSize + 50;

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
	const homeHeader = (
		<View
			style={{
				paddingHorizontal: headerPaddingHorizontal,
				paddingTop: headerPaddingVertical,
				paddingBottom: headerPaddingVertical,
				backgroundColor: lightThemeEnabled ? '#FFFFFF' : '#09090B',
				borderBottomWidth: 1,
				borderBottomColor: lightThemeEnabled ? '#E4E4E7' : '#09090B',
			}}>
			<View
				className={`flex-row justify-between items-center ${
					usePhonePortraitHeader ? 'gap-2' : 'gap-3'
				}`}
				style={{
					minHeight: headerTopRowHeight,
					marginBottom: useTabletHomeRefresh ? 12 : usePhonePortraitHeader ? 12 : 16,
				}}>
				<View
					className='flex-row items-center flex-1 min-w-0'
					style={{ transform: [{ translateY: titleGroupOffsetY }] }}>
					<View className={usePhonePortraitHeader ? 'mr-2' : 'mr-3'}>
						<ThemeAwareLogo
							source={require('../../assets/images/fixo3.png')}
							width={headerLogoWidth}
							height={headerLogoHeight}
							lightMode={lightThemeEnabled}
							resizeMode='contain'
						/>
					</View>
					<Text
						className={`${headerTitleClassName} ${lightThemeEnabled ? 'text-[#18181B]' : 'text-white'} font-bold flex-1`}
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
						className={`flex-row items-center justify-center border rounded-[10px] ${
							lightThemeEnabled
								? 'border-[#E4E4E7] bg-[#FAFAFA]'
								: 'border-[#2A2A2A] bg-[#111111]'
						}`}
						style={{
							height: headerButtonHeight,
							width: useIconOnlyHeaderButtons ? headerButtonHeight : undefined,
							paddingHorizontal: headerButtonPaddingHorizontal,
							transform: [{ translateY: headerButtonOffsetY }],
						}}>
						<MaterialCommunityIcons name='cog-outline' size={21} color='#FF7A00' />
						{useIconOnlyHeaderButtons ? null : (
							<Text
								className={`${lightThemeEnabled ? 'text-[#3F3F46]' : 'text-[#E6E6E6]'} ml-4 text-[13px] font-semibold tracking-wider`}>
								USTAWIENIA
							</Text>
						)}
					</TouchableOpacity>
					<TouchableOpacity
						onPress={() => router.push('/history')}
						accessibilityRole='button'
						accessibilityLabel='Historia czatów'
						className={`flex-row items-center justify-center border rounded-[10px] ${
							lightThemeEnabled
								? 'border-[#E4E4E7] bg-[#FAFAFA]'
								: 'border-[#2A2A2A] bg-[#111111]'
						}`}
						style={{
							height: headerButtonHeight,
							width: useIconOnlyHeaderButtons ? headerButtonHeight : undefined,
							paddingHorizontal: headerButtonPaddingHorizontal,
							transform: [{ translateY: headerButtonOffsetY }],
						}}>
						<MaterialCommunityIcons name='history' size={21} color='#FF7A00' />
						{useIconOnlyHeaderButtons ? null : (
							<Text
								className={`${lightThemeEnabled ? 'text-[#3F3F46]' : 'text-[#E6E6E6]'} ml-4 text-[13px] font-semibold tracking-wider`}>
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
				lightMode={lightThemeEnabled}
			/>
		</View>
	);

	return (
		<SafeAreaView
			className={`flex-1 ${lightThemeEnabled ? 'bg-[#F7F7F8]' : 'bg-[#09090B]'}`}
			edges={['top', 'left', 'right']}>
			<StatusBar
				style={lightThemeEnabled ? 'dark' : 'light'}
				backgroundColor={lightThemeEnabled ? '#FFFFFF' : '#09090B'}
			/>
			<View className='flex-1'>
				{isLoadingDevices ? (
					<View className='flex-1'>
						{homeHeader}
						<View className='flex-1 justify-center items-center'>
							<ActivityIndicator size='large' color={PRIMARY_ORANGE} />
							<Text
								className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-gray-400'} mt-4`}>
								Ładowanie maszyn...
							</Text>
						</View>
					</View>
				) : (
					<FlatList
						key={`grid-${columns}-${lightThemeEnabled ? 'light' : 'dark'}`}
						data={filteredVehicles}
						extraData={lightThemeEnabled}
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
								lightMode={lightThemeEnabled}
							/>
						)}
						ListEmptyComponent={
							<View className='w-full items-center justify-center px-6 py-12'>
								<MaterialCommunityIcons name='forklift' size={36} color='#71717A' />
								<Text
									className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-gray-400'} text-center mt-3`}>
									Nie ma pojazdów pasujących do wybranych filtrów.
								</Text>
							</View>
						}
						ListHeaderComponent={homeHeader}
						ListHeaderComponentStyle={{
							alignSelf: 'stretch',
							marginHorizontal: -paddingHorizontal,
						}}
						numColumns={columns}
						showsVerticalScrollIndicator={false}
						contentContainerStyle={{
							paddingBottom: bottomListPadding,
							paddingHorizontal: paddingHorizontal,
							alignItems: 'center',
						}}
					/>
				)}
			</View>

			<View
				pointerEvents='box-none'
				className='absolute left-0 right-0 items-center px-4'
				style={{ bottom: scanButtonBottom, zIndex: 30, elevation: 30 }}>
				<TouchableOpacity
					onPress={() => setIsNameplateScannerOpen(true)}
					accessibilityRole='button'
					accessibilityLabel='Zrób zdjęcie tabliczki znamionowej'
					activeOpacity={0.86}
					className='items-center'>
					<View
						className={`items-center justify-center border rounded-[22px] ${
							lightThemeEnabled
								? 'border-[#D4D4D8] bg-white'
								: 'border-[#3F3F46] bg-[#18181B]'
						}`}
						style={{
							width: scanButtonSize,
							height: scanButtonSize,
							shadowColor: '#000000',
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: lightThemeEnabled ? 0.18 : 0.45,
							shadowRadius: 8,
						}}>
						<MaterialCommunityIcons
							name='camera-outline'
							size={isTablet ? 50 : 44}
							color='#FF6B00'
						/>
					</View>
				</TouchableOpacity>
			</View>

			<ServiceErrorModal
				visible={Boolean(serviceErrorFeature)}
				featureName={serviceErrorFeature || 'wybrana funkcja'}
				onClose={() => setServiceErrorFeature(null)}
				lightMode={lightThemeEnabled}
				dismissible={
					serviceErrorFeature !== AUTH_SERVICE_FEATURE &&
					serviceErrorFeature !== CONFIG_SERVICE_FEATURE
				}
			/>
			{isNameplateScannerOpen ? (
				<NameplateScannerModal
					visible
					lightMode={lightThemeEnabled}
					onClose={() => setIsNameplateScannerOpen(false)}
					onComplete={openRecognizedVehicle}
					onServiceError={showServiceError}
				/>
			) : null}
		</SafeAreaView>
	);
}
