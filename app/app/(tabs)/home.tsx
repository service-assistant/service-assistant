import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import ServiceErrorModal from '@/components/feedback/ServiceErrorModal';
import HomeHeader from '@/components/vehicles/HomeHeader';
import NameplateScannerModal from '@/components/vehicles/NameplateScannerModal';
import VehicleCard, { type Vehicle } from '@/components/vehicles/VehicleCard';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { type ResponsiveLayout, useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
	categoryPathStartsWith,
	findCategoryPath,
	useVehicleMetadata,
} from '@/hooks/use-vehicle-metadata';
import type { NameplateDeviceCandidate, NameplateRecognition } from '@/types/nameplate';
import { CONFIG_SERVICE_FEATURE } from '@/utils/api-config';
import { AUTH_SERVICE_FEATURE } from '@/utils/auth-errors';
import { createNameplateThread } from '@/utils/nameplate-api';
import { isTransientNetworkError } from '@/utils/network';

const LARGE_HOME_LAYOUT = {
	cardMargin: 12,
	scanButtonSize: 112,
	scanIconSize: 50,
	useCompactCards: true,
	web: {
		paddingHorizontal: 20,
		cardHeight: 360,
		imageHeight: 220,
	},
	native: {
		paddingHorizontal: 20,
		cardHeight: 320,
		imageHeight: 210,
	},
} as const;

const COMPACT_HOME_LAYOUT = {
	cardMargin: 16,
	scanButtonSize: 96,
	scanIconSize: 44,
	useCompactCards: false,
	web: {
		paddingHorizontal: 16,
		cardHeight: 380,
		imageHeight: 240,
	},
	native: {
		paddingHorizontal: 8,
		cardHeight: null,
		imageHeight: null,
	},
} as const;

const HOME_LAYOUT_CONFIG = {
	largePortrait: { ...LARGE_HOME_LAYOUT, nativeColumns: 2 },
	largeLandscape: { ...LARGE_HOME_LAYOUT, nativeColumns: 3 },
	compactPortrait: { ...COMPACT_HOME_LAYOUT, nativeColumns: 2 },
	compactLandscape: { ...COMPACT_HOME_LAYOUT, nativeColumns: 2 },
} as const satisfies Record<ResponsiveLayout, object>;

export default function HomeScreen() {
	const router = useRouter();
	const { width, isWeb, layout } = useResponsiveLayout();
	const insets = useSafeAreaInsets();

	const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
	const [searchQuery] = useState<string>('');
	const [serviceErrorFeature, setServiceErrorFeature] = useState<string | null>(null);
	const { reconnectCount } = useNetworkStatus();

	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		if (isTransientNetworkError(error)) return;
		setServiceErrorFeature(featureName);
	}, []);

	const { categories, rawDevices, isLoadingCategories, isLoadingDevices } = useVehicleMetadata({
		onServiceError: showServiceError,
		refreshKey: reconnectCount,
	});
	const [isNameplateScannerOpen, setIsNameplateScannerOpen] = useState(false);

	const mappedVehicles = rawDevices.map((device) => {
		const categoryPath = findCategoryPath(categories, device.category_id);
		const rootCategory = categoryPath[0];
		const leafCategory = categoryPath[categoryPath.length - 1];

		return {
			id: device.id.toString(),
			name: device.name,
			brand: rootCategory?.name || 'BEZ KATEGORII',
			type: leafCategory?.name || 'BEZ KATEGORII',
			imageUrl: device.image_url?.trim() ? { uri: device.image_url } : undefined,
			imageOffsetY: 0,
			imageZoom: 1.0,
			categoryPath,
		};
	});

	const getRemoteBrandLogo = (brandName: string): string | null => {
		const category = categories.find(
			(candidate) => candidate.name.toLowerCase() === brandName.toLowerCase(),
		);
		return category?.image_url || null;
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
		const matchesCategory = categoryPathStartsWith(v.categoryPath, selectedCategoryIds);
		const mSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
		return matchesCategory && mSearch;
	});

	const responsive = HOME_LAYOUT_CONFIG[layout];
	const platformLayout = isWeb ? responsive.web : responsive.native;
	const paddingHorizontal = platformLayout.paddingHorizontal;
	const containerPadding = paddingHorizontal * 2;

	const columns = isWeb
		? Math.max(2, Math.floor((width - containerPadding) / 320))
		: responsive.nativeColumns;

	const cardWidth = (width - containerPadding) / columns - responsive.cardMargin;
	const cardHeight = platformLayout.cardHeight ?? cardWidth + 90;
	const imageHeight = platformLayout.imageHeight ?? cardWidth;
	const vehicleImageZoom = 1.02;

	const scanButtonBottom = (insets.bottom || 0) + 16;
	const bottomListPadding = isWeb ? 36 : scanButtonBottom + responsive.scanButtonSize + 50;

	const homeHeader = (
		<HomeHeader
			categories={categories}
			selectedCategoryIds={selectedCategoryIds}
			onCategoryPathChange={setSelectedCategoryIds}
			isLoadingCategories={isLoadingCategories}
			layout={layout}
			lightMode={lightThemeEnabled}
			onOpenSettings={() => router.push('/settings')}
			onOpenHistory={() => router.push('/history')}
		/>
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
							<ActivityIndicator size='large' color='#FF6B00' />
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
								isWeb={isWeb}
								useCompactLayout={responsive.useCompactCards}
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

			{isWeb ? null : (
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
								width: responsive.scanButtonSize,
								height: responsive.scanButtonSize,
								shadowColor: '#000000',
								shadowOffset: { width: 0, height: 4 },
								shadowOpacity: lightThemeEnabled ? 0.18 : 0.45,
								shadowRadius: 8,
							}}>
							<MaterialCommunityIcons
								name='camera-outline'
								size={responsive.scanIconSize}
								color='#FF6B00'
							/>
						</View>
					</TouchableOpacity>
				</View>
			)}

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
			{!isWeb && isNameplateScannerOpen ? (
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
