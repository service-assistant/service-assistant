import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ServiceErrorModal from '@/components/feedback/ServiceErrorModal';
import ThemeAwareLogo from '@/components/ui/ThemeAwareLogo';
import HistoryHeader from '@/components/vehicles/HistoryHeader';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { type ResponsiveLayout, useResponsiveLayout } from '@/hooks/use-responsive-layout';
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

const LARGE_HISTORY_LAYOUT = {
	pagePaddingHorizontal: 20,
	cardPaddingVertical: 14,
	cardBorderRadius: 10,
} as const;

const COMPACT_HISTORY_LAYOUT = {
	pagePaddingHorizontal: 16,
	cardPaddingVertical: 16,
	cardBorderRadius: 12,
} as const;

const HISTORY_LAYOUT_CONFIG = {
	largePortrait: LARGE_HISTORY_LAYOUT,
	largeLandscape: LARGE_HISTORY_LAYOUT,
	compactPortrait: COMPACT_HISTORY_LAYOUT,
	compactLandscape: COMPACT_HISTORY_LAYOUT,
} as const satisfies Record<ResponsiveLayout, object>;

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
	const { layout } = useResponsiveLayout();
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

	const responsive = HISTORY_LAYOUT_CONFIG[layout];
	const historyCardMarginBottom = 12;

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
					paddingBottom: 36,
				}}
				showsVerticalScrollIndicator={false}>
				<HistoryHeader
					categories={categories}
					selectedCategoryIds={selectedCategoryIds}
					onCategoryPathChange={setSelectedCategoryIds}
					isLoadingCategories={isLoadingCategories}
					layout={layout}
					lightMode={lightThemeEnabled}
					onBack={() => router.push('/home')}
				/>

				<View style={{ paddingHorizontal: responsive.pagePaddingHorizontal }}>
					<View className='h-4' />

					{isLoading ? (
						<ActivityIndicator size='large' color='#FF6B00' className='mt-12' />
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
										paddingVertical: responsive.cardPaddingVertical,
										borderRadius: responsive.cardBorderRadius,
										marginBottom: historyCardMarginBottom,
									}}>
									<View
										className='w-2 h-2 rounded-full mr-3'
										style={
											isTodayInPoland(item.updated_at)
												? {
														backgroundColor: '#FF6B00',
														shadowColor: '#FF6B00',
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
				</View>
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
