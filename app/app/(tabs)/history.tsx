import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	ScrollView,
	Text,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ServiceErrorModal from '@/components/ServiceErrorModal';
import ThemeAwareLogo from '@/components/ThemeAwareLogo';
import VehicleFilters from '@/components/VehicleFilters';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNetworkStatus } from '@/hooks/use-network-status';
import {
	categoryPathStartsWith,
	findCategoryPath,
	useVehicleMetadata,
} from '@/hooks/use-vehicle-metadata';
import { API_URL, API_URL_CONFIG_ERROR } from '@/utils/api-config';
import {
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '@/utils/auth-errors';
import { fetchWithRetry, HttpError, isTransientNetworkError } from '@/utils/network';

const PRIMARY_ORANGE = '#FF6B00';

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
	categoryPath: ReturnType<typeof findCategoryPath>;
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
	const isPortrait = height > width;
	const useTabletHistoryRefresh = isTablet;
	const usePhonePortraitHeader = !isTablet && isPortrait;
	const useTabletFilterStyle = useTabletHistoryRefresh || usePhonePortraitHeader;
	const [threads, setThreads] = useState<ChatThread[]>([]);
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
	const [isLoadingThreads, setIsLoadingThreads] = useState(true);
	const [serviceErrorFeature, setServiceErrorFeature] = useState<string | null>(null);
	const { reconnectCount } = useNetworkStatus();

	const showServiceError = useCallback((featureName: string, error: unknown) => {
		console.log(`Handled service error (${featureName}):`, error);
		if (isTransientNetworkError(error)) return;
		setServiceErrorFeature(featureName);
	}, []);

	const {
		categories,
		rawDevices: devices,
		isLoadingCategories,
		isLoadingDevices,
	} = useVehicleMetadata({ onServiceError: showServiceError, refreshKey: reconnectCount });
	const { lightThemeEnabled } = useAppSettings();
	const isLoading = isLoadingThreads || isLoadingCategories || isLoadingDevices;

	useFocusEffect(
		useCallback(() => {
			// Recreate this focus effect whenever the global connection recovers.
			void reconnectCount;
			const abortController = new AbortController();

			const loadHistory = async () => {
				setIsLoadingThreads(true);

				try {
					if (API_URL_CONFIG_ERROR) throw API_URL_CONFIG_ERROR;
					const authToken = getAuthTokenOrThrow();
					const threadsResponse = await fetchWithRetry(`${API_URL}/api/threads`, {
						headers: {
							Accept: 'application/json',
							Authorization: `Bearer ${authToken}`,
						},
						signal: abortController.signal,
					});

					throwIfAuthResponseError(threadsResponse);

					if (!threadsResponse.ok) {
						throw new HttpError(threadsResponse.status, 'Failed to load chat history.');
					}

					const loadedThreads = (await threadsResponse.json()) as ChatThread[];
					setThreads(loadedThreads);
				} catch (error: any) {
					if (error.name !== 'AbortError') {
						console.log('Handled chat history load error:', error);
						showServiceError(getServiceErrorFeature(error, 'historia czatów'), error);
					}
				} finally {
					if (!abortController.signal.aborted) {
						setIsLoadingThreads(false);
					}
				}
			};

			loadHistory();

			return () => abortController.abort();
		}, [reconnectCount, showServiceError]),
	);

	const historyItems: HistoryItem[] = [...threads]
		.reverse()
		.slice(0, 30)
		.map((thread) => {
			const device = devices.find((candidate) => candidate.id === thread.device_id);
			const categoryPath = findCategoryPath(categories, device?.category_id ?? null);
			const rootCategory = categoryPath[0];
			const leafCategory = categoryPath[categoryPath.length - 1];

			return {
				...thread,
				deviceName: device?.name || 'Nieznany pojazd',
				brandName: rootCategory?.name || 'Bez kategorii',
				brandLogoUrl: rootCategory?.image_url || null,
				deviceTypeName: leafCategory?.name || 'Bez kategorii',
				categoryPath,
			};
		});

	const filteredHistoryItems = historyItems.filter((item) => {
		return categoryPathStartsWith(item.categoryPath, selectedCategoryIds);
	});

	const pagePaddingHorizontal = useTabletHistoryRefresh ? 20 : 16;
	const pagePaddingTop = useTabletHistoryRefresh ? 10 : usePhonePortraitHeader ? 10 : 16;
	const headerTitleClassName = useTabletHistoryRefresh ? 'text-3xl' : 'text-2xl';
	const headerMinHeight = useTabletHistoryRefresh ? 44 : 38;
	const headerBottomMargin = useTabletHistoryRefresh ? 12 : usePhonePortraitHeader ? 12 : 16;
	const headerBackButtonHeight = usePhonePortraitHeader ? 42 : 48;
	const headerBackButtonIconOnly = usePhonePortraitHeader;
	const historyCardPaddingVertical = useTabletHistoryRefresh ? 14 : 16;
	const historyCardBorderRadius = useTabletHistoryRefresh ? 10 : 12;
	const historyCardMarginBottom = useTabletHistoryRefresh ? 12 : 12;

	return (
		<SafeAreaView
			className={`flex-1 ${lightThemeEnabled ? 'bg-[#F7F7F8]' : 'bg-[#09090B]'}`}
			edges={['top', 'left', 'right']}>
			<StatusBar
				style={lightThemeEnabled ? 'dark' : 'light'}
				backgroundColor={lightThemeEnabled ? '#F7F7F8' : '#09090B'}
			/>
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
						className={`flex-row items-center justify-center border rounded-[10px] ${
							lightThemeEnabled
								? 'border-[#E4E4E7] bg-white'
								: 'border-[#2A2A2A] bg-[#0D0D0D]'
						}`}
						style={{
							height: headerBackButtonHeight,
							width: headerBackButtonIconOnly ? headerBackButtonHeight : undefined,
							marginRight: usePhonePortraitHeader ? 4 : 20,
							paddingHorizontal: headerBackButtonIconOnly ? 0 : 18,
						}}>
						<Feather
							name='arrow-left'
							size={headerBackButtonIconOnly ? 21 : 22}
							color='#FF7A00'
						/>
						{headerBackButtonIconOnly ? null : (
							<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
								WSTECZ
							</Text>
						)}
					</TouchableOpacity>
					<Text
						className={`${headerTitleClassName} ${lightThemeEnabled ? 'text-[#18181B]' : 'text-white'} font-bold flex-1`}
						numberOfLines={1}
						adjustsFontSizeToFit>
						Historia czatów
					</Text>
				</View>

				<VehicleFilters
					categories={categories}
					selectedCategoryIds={selectedCategoryIds}
					onCategoryPathChange={setSelectedCategoryIds}
					useTabletRefresh={useTabletFilterStyle}
					isLoading={isLoadingCategories}
					primaryColor={PRIMARY_ORANGE}
					lightMode={lightThemeEnabled}
				/>

				<View className='h-4' />

				{isLoading ? (
					<ActivityIndicator size='large' color={PRIMARY_ORANGE} className='mt-12' />
				) : filteredHistoryItems.length === 0 ? (
					<View
						className={`items-center justify-center border rounded-[12px] px-6 py-12 ${
							lightThemeEnabled
								? 'bg-white border-[#E4E4E7]'
								: 'bg-[#18181B] border-white/5'
						}`}>
						<MaterialCommunityIcons name='history' size={36} color='#71717A' />
						<Text
							className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-gray-400'} text-center mt-3`}>
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
								className={`flex-row items-center border px-4 ${
									lightThemeEnabled
										? 'bg-white border-[#E4E4E7]'
										: 'bg-[#18181B] border-white/5'
								}`}
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
										className={`${lightThemeEnabled ? 'text-[#18181B]' : 'text-white'} text-base font-bold`}
										numberOfLines={1}>
										{item.title}
									</Text>
									<View className='flex-row items-center flex-wrap mt-2'>
										{item.brandLogoUrl ? (
											<View style={{ marginRight: 7 }}>
												<ThemeAwareLogo
													source={{ uri: item.brandLogoUrl }}
													width={66}
													height={18}
													lightMode={lightThemeEnabled}
													resizeMode='contain'
												/>
											</View>
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
								<View
									className={`w-10 h-10 rounded-full items-center justify-center ml-3 ${lightThemeEnabled ? 'bg-[#F4F4F5]' : 'bg-[#202024]'}`}>
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
				lightMode={lightThemeEnabled}
			/>
		</SafeAreaView>
	);
}
