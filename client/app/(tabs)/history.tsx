import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	Image,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ServiceErrorModal from '@/components/ServiceErrorModal';
import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';

const PRIMARY_ORANGE = '#FF6B00';

type Brand = {
	id: number;
	name: string;
	logo_url: string;
};

type DeviceType = {
	id: number;
	name: string;
};

type Device = {
	id: number;
	brand_id: number;
	device_type_id: number;
	name: string;
};

type ChatThread = {
	id: number;
	device_id: number;
	title: string;
	created_at: string;
	updated_at: string;
};

type HistoryItem = ChatThread & {
	deviceName: string;
	brandName: string;
	brandLogoUrl: string | null;
	deviceTypeName: string;
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

const BrandLogoOrText: React.FC<{
	brandName: string;
	logoUrl: string | null;
	active: boolean;
}> = ({ brandName, logoUrl, active }) => {
	const [imageError, setImageError] = useState(false);

	if (brandName === 'WSZYSTKIE' || !logoUrl || imageError) {
		return (
			<Text className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>
				{brandName.toUpperCase()}
			</Text>
		);
	}

	const dims = FILTER_LOGO_SIZES[brandName.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;

	return (
		<Image
			source={{ uri: logoUrl }}
			style={{ width: dims.width, height: dims.height }}
			resizeMode='contain'
			onError={() => setImageError(true)}
		/>
	);
};

const parseApiDate = (value: string) => {
	const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
	return new Date(hasTimezone ? value : `${value}Z`);
};

const formatDate = (value: string) => {
	const date = parseApiDate(value);

	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Warsaw',
	}).format(date);
};

const isTodayInPoland = (value: string) => {
	const date = parseApiDate(value);

	if (Number.isNaN(date.getTime())) return false;

	const formatter = new Intl.DateTimeFormat('en-CA', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone: 'Europe/Warsaw',
	});

	return formatter.format(date) === formatter.format(new Date());
};

export default function HistoryScreen() {
	const router = useRouter();
	const { width, height } = useWindowDimensions();
	const shortestScreenSide = Math.min(width, height);
	const isTablet = shortestScreenSide >= 600;
	const useTabletHistoryRefresh = isTablet;
	const [brands, setBrands] = useState<Brand[]>([]);
	const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
	const [devices, setDevices] = useState<Device[]>([]);
	const [threads, setThreads] = useState<ChatThread[]>([]);
	const [activeBrandFilter, setActiveBrandFilter] = useState('WSZYSTKIE');
	const [activeTypeFilter, setActiveTypeFilter] = useState('WSZYSTKIE');
	const [isLoading, setIsLoading] = useState(true);
	const [serviceErrorFeature, setServiceErrorFeature] = useState<string | null>(null);

	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		setServiceErrorFeature(featureName);
	}, []);

	useFocusEffect(
		useCallback(() => {
			const abortController = new AbortController();

			const loadHistory = async () => {
				setIsLoading(true);

				try {
					if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
					const authToken = getAuthTokenOrThrow();
					const headers = {
						Accept: 'application/json',
						Authorization: `Bearer ${authToken}`,
					};

					const [brandsResponse, typesResponse, devicesResponse, threadsResponse] =
						await Promise.all([
							fetch(`${AUTH_URL}/api/brands`, {
								headers,
								signal: abortController.signal,
							}),
							fetch(`${AUTH_URL}/api/device_types`, {
								headers,
								signal: abortController.signal,
							}),
							fetch(`${AUTH_URL}/api/devices`, {
								headers,
								signal: abortController.signal,
							}),
							fetch(`${AUTH_URL}/api/threads`, {
								headers,
								signal: abortController.signal,
							}),
						]);

					for (const response of [
						brandsResponse,
						typesResponse,
						devicesResponse,
						threadsResponse,
					]) {
						throwIfAuthResponseError(response);
					}

					if (
						!brandsResponse.ok ||
						!typesResponse.ok ||
						!devicesResponse.ok ||
						!threadsResponse.ok
					) {
						throw new Error('Failed to load chat history.');
					}

					const [loadedBrands, loadedTypes, loadedDevices, loadedThreads] =
						await Promise.all([
							brandsResponse.json() as Promise<Brand[]>,
							typesResponse.json() as Promise<DeviceType[]>,
							devicesResponse.json() as Promise<Device[]>,
							threadsResponse.json() as Promise<ChatThread[]>,
						]);

					setBrands(loadedBrands);
					setDeviceTypes(loadedTypes);
					setDevices(loadedDevices);
					setThreads(loadedThreads);
				} catch (error: any) {
					if (error.name !== 'AbortError') {
						console.log('Handled chat history load error:', error);
						showServiceError(getServiceErrorFeature(error, 'historia czatów'), error);
					}
				} finally {
					if (!abortController.signal.aborted) {
						setIsLoading(false);
					}
				}
			};

			loadHistory();

			return () => abortController.abort();
		}, [showServiceError]),
	);

	const historyItems: HistoryItem[] = [...threads]
		.reverse()
		.slice(0, 30)
		.map((thread) => {
			const device = devices.find((candidate) => candidate.id === thread.device_id);
			const brand = brands.find((candidate) => candidate.id === device?.brand_id);
			const deviceType = deviceTypes.find(
				(candidate) => candidate.id === device?.device_type_id,
			);

			return {
				...thread,
				deviceName: device?.name || 'Nieznany pojazd',
				brandName: brand?.name || 'Nieznana marka',
				brandLogoUrl: brand?.logo_url || null,
				deviceTypeName: deviceType?.name || 'Nieznany typ',
			};
		});

	const filteredHistoryItems = historyItems.filter((item) => {
		const matchesBrand =
			activeBrandFilter === 'WSZYSTKIE' ||
			item.brandName.toLowerCase() === activeBrandFilter.toLowerCase();
		const matchesType =
			activeTypeFilter === 'WSZYSTKIE' ||
			item.deviceTypeName.toLowerCase() === activeTypeFilter.toLowerCase();

		return matchesBrand && matchesType;
	});

	const brandFilterOptions = [{ name: 'WSZYSTKIE', logo_url: null }, ...brands];
	const typeFilterOptions = [{ name: 'WSZYSTKIE' }, ...deviceTypes];
	const pagePaddingHorizontal = useTabletHistoryRefresh ? 20 : 16;
	const pagePaddingTop = useTabletHistoryRefresh ? 10 : 16;
	const headerTitleClassName = useTabletHistoryRefresh ? 'text-3xl' : 'text-2xl';
	const headerMinHeight = useTabletHistoryRefresh ? 44 : 38;
	const headerBottomMargin = useTabletHistoryRefresh ? 12 : 16;
	const filterLabelClassName = `text-gray-400 font-bold uppercase tracking-widest ml-2 ${
		useTabletHistoryRefresh ? 'text-[12px] mb-1' : 'text-sm mb-2'
	}`;
	const getFilterChipStyle = (active: boolean) =>
		useTabletHistoryRefresh
			? {
					height: 42,
					paddingHorizontal: 20,
					paddingVertical: 0,
					marginRight: 12,
					backgroundColor: active ? 'rgba(255, 107, 0, 0.16)' : '#242428',
					borderWidth: 1,
					borderColor: active ? PRIMARY_ORANGE : 'rgba(255, 255, 255, 0.07)',
				}
			: {
					backgroundColor: active ? PRIMARY_ORANGE : '#27272a',
				};
	const historyCardPaddingVertical = useTabletHistoryRefresh ? 14 : 16;
	const historyCardBorderRadius = useTabletHistoryRefresh ? 10 : 12;
	const historyCardMarginBottom = useTabletHistoryRefresh ? 12 : 12;

	return (
		<SafeAreaView className='flex-1 bg-[#09090b]' edges={['top', 'left', 'right']}>
			<ScrollView
				className='flex-1'
				contentContainerStyle={{
					paddingHorizontal: pagePaddingHorizontal,
					paddingTop: pagePaddingTop,
					paddingBottom: 36,
				}}
				showsVerticalScrollIndicator={false}>
				<View
					className='flex-row items-center gap-3'
					style={{ minHeight: headerMinHeight, marginBottom: headerBottomMargin }}>
					<TouchableOpacity
						onPress={() => router.push('/home')}
						accessibilityRole='button'
						accessibilityLabel='Wstecz'
						className='flex-row items-center justify-center mr-5 border border-[#2A2A2A] rounded-[10px] bg-[#0D0D0D]'
						style={{
							height: useTabletHistoryRefresh ? 44 : 48,
							paddingHorizontal: useTabletHistoryRefresh ? 16 : 18,
						}}>
						<Feather name='arrow-left' size={22} color='#FF7A00' />
						<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
							WSTECZ
						</Text>
					</TouchableOpacity>
					<Text className={`${headerTitleClassName} text-white font-bold`}>
						Historia czatów
					</Text>
				</View>

				<View style={{ marginBottom: useTabletHistoryRefresh ? 8 : 12 }}>
					<Text className={filterLabelClassName}>Marka</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{brandFilterOptions.map((brand) => (
							<TouchableOpacity
								key={brand.name}
								onPress={() => setActiveBrandFilter(brand.name)}
								style={getFilterChipStyle(activeBrandFilter === brand.name)}
								className={`rounded-full justify-center items-center flex-row ${
									useTabletHistoryRefresh ? '' : 'px-6 py-3 mr-4 min-h-[48px]'
								}`}>
								<BrandLogoOrText
									brandName={brand.name}
									logoUrl={brand.logo_url}
									active={activeBrandFilter === brand.name}
								/>
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>

				<View className='mb-0'>
					<Text className={filterLabelClassName}>Typ</Text>
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{typeFilterOptions.map((type) => (
							<TouchableOpacity
								key={type.name}
								onPress={() => setActiveTypeFilter(type.name)}
								style={getFilterChipStyle(activeTypeFilter === type.name)}
								className={`rounded-full justify-center items-center flex-row ${
									useTabletHistoryRefresh ? '' : 'px-6 py-3 mr-4 min-h-[48px]'
								}`}>
								<Text
									className={`text-sm font-bold uppercase ${
										activeTypeFilter === type.name
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
									{type.name}
								</Text>
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>

				<View className='h-4' />

				{isLoading ? (
					<ActivityIndicator size='large' color={PRIMARY_ORANGE} className='mt-12' />
				) : filteredHistoryItems.length === 0 ? (
					<View className='items-center justify-center bg-[#18181b] border border-white/5 rounded-[12px] px-6 py-12'>
						<MaterialCommunityIcons name='history' size={36} color='#71717A' />
						<Text className='text-gray-400 text-center mt-3'>
							Brak czatów pasujących do wybranych filtrów.
						</Text>
					</View>
				) : (
					<View>
						{filteredHistoryItems.map((item) => (
							<TouchableOpacity
								key={item.id}
								onPress={() =>
									router.push({
										pathname: '/chat',
										params: {
											deviceId: item.device_id.toString(),
											deviceName: item.deviceName,
											threadId: item.id.toString(),
											chatSession: `history-${item.id}`,
											...(item.brandLogoUrl
												? { logoUrl: item.brandLogoUrl }
												: {}),
										},
									})
								}
								accessibilityRole='button'
								accessibilityLabel={`Otwórz czat: ${item.title}`}
								className='flex-row items-center bg-[#18181b] border border-white/5 px-4'
								style={{
									paddingVertical: historyCardPaddingVertical,
									borderRadius: historyCardBorderRadius,
									marginBottom: historyCardMarginBottom,
								}}>
								<View
									className='w-2 h-2 rounded-full mr-3'
									style={
										isTodayInPoland(item.updated_at)
											? {
													backgroundColor: PRIMARY_ORANGE,
													shadowColor: PRIMARY_ORANGE,
													shadowOffset: { width: 0, height: 0 },
													shadowOpacity: 0.9,
													shadowRadius: 8,
													elevation: 8,
												}
											: { backgroundColor: '#52525B' }
									}
								/>
								<View className='flex-1 min-w-0'>
									<Text
										className='text-white text-base font-bold'
										numberOfLines={1}>
										{item.title}
									</Text>
									<View className='flex-row items-center flex-wrap mt-2'>
										{item.brandLogoUrl ? (
											<Image
												source={{ uri: item.brandLogoUrl }}
												style={{ width: 66, height: 18, marginRight: 7 }}
												resizeMode='contain'
											/>
										) : (
											<Text className='text-[#FF8A4C] text-[11px] font-bold mr-2'>
												{item.brandName.toUpperCase()}
											</Text>
										)}
										<Text className='text-[#FF8A4C] text-[11px] font-semibold'>
											{item.deviceName.toUpperCase()}
										</Text>
										<Text className='text-gray-600 mx-3'>•</Text>
										<MaterialCommunityIcons
											name='clock-outline'
											size={14}
											color='#FF8A4C'
										/>
										<Text className='text-[#FF8A4C] text-[11px] ml-1'>
											{formatDate(item.updated_at)}
										</Text>
									</View>
								</View>
								<View className='w-10 h-10 rounded-full bg-[#202024] items-center justify-center ml-3'>
									<MaterialCommunityIcons
										name='chevron-right'
										size={24}
										color='#FF8A4C'
									/>
								</View>
							</TouchableOpacity>
						))}
					</View>
				)}
			</ScrollView>
			<ServiceErrorModal
				visible={Boolean(serviceErrorFeature)}
				featureName={serviceErrorFeature || 'wybrana funkcja'}
				onClose={() => setServiceErrorFeature(null)}
			/>
		</SafeAreaView>
	);
}
