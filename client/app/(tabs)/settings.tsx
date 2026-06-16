import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
	ScrollView,
	Switch,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppSettings } from '@/hooks/use-app-settings';

const PRIMARY_ORANGE = '#FF6B00';

export default function SettingsScreen() {
	const router = useRouter();
	const { wakeWordEnabled, ttsEnabled, setWakeWordEnabled, setTtsEnabled } = useAppSettings();
	const { width, height } = useWindowDimensions();
	const shortestScreenSide = Math.min(width, height);
	const isTablet = shortestScreenSide >= 600;
	const useTabletSettingsRefresh = isTablet;
	const usePhoneBackIconOnly = !isTablet;

	const pagePaddingHorizontal = useTabletSettingsRefresh ? 20 : 16;
	const pagePaddingTop = useTabletSettingsRefresh ? 10 : 16;
	const headerTitleClassName = useTabletSettingsRefresh ? 'text-3xl' : 'text-2xl';
	const headerMinHeight = useTabletSettingsRefresh ? 44 : 38;
	const headerBottomMargin = useTabletSettingsRefresh ? 12 : 16;
	const headerBackButtonHeight = usePhoneBackIconOnly ? 42 : 48;
	const rowPaddingVertical = useTabletSettingsRefresh ? 16 : 18;

	const switchTrackColor = { false: '#27272A', true: '#8A3D00' };

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
							height: headerBackButtonHeight,
							width: usePhoneBackIconOnly ? headerBackButtonHeight : undefined,
							paddingHorizontal: usePhoneBackIconOnly ? 0 : 18,
						}}>
						<Feather
							name='arrow-left'
							size={usePhoneBackIconOnly ? 21 : 22}
							color='#FF7A00'
						/>
						{usePhoneBackIconOnly ? null : (
							<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
								WSTECZ
							</Text>
						)}
					</TouchableOpacity>
					<Text className={`${headerTitleClassName} text-white font-bold`}>
						Ustawienia
					</Text>
				</View>

				<View className='bg-[#18181b] border border-white/5 rounded-[12px] overflow-hidden'>
					<TouchableOpacity
						onPress={() => setWakeWordEnabled(!wakeWordEnabled)}
						accessibilityRole='switch'
						accessibilityState={{ checked: wakeWordEnabled }}
						accessibilityLabel='Słowo wybudzające eksperymentalne'
						activeOpacity={0.75}
						className='flex-row items-center justify-between px-4 border-b border-white/5'
						style={{ paddingVertical: rowPaddingVertical }}>
						<Text className='text-white text-base font-semibold flex-1 mr-4'>
							Słowo wybudzające (eksperymentalne)
						</Text>
						<Switch
							value={wakeWordEnabled}
							onValueChange={setWakeWordEnabled}
							trackColor={switchTrackColor}
							thumbColor={wakeWordEnabled ? PRIMARY_ORANGE : '#A1A1AA'}
							ios_backgroundColor='#27272A'
						/>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => setTtsEnabled(!ttsEnabled)}
						accessibilityRole='switch'
						accessibilityState={{ checked: ttsEnabled }}
						accessibilityLabel='TTS'
						activeOpacity={0.75}
						className='flex-row items-center justify-between px-4'
						style={{ paddingVertical: rowPaddingVertical }}>
						<Text className='text-white text-base font-semibold flex-1 mr-4'>TTS</Text>
						<Switch
							value={ttsEnabled}
							onValueChange={setTtsEnabled}
							trackColor={switchTrackColor}
							thumbColor={ttsEnabled ? PRIMARY_ORANGE : '#A1A1AA'}
							ios_backgroundColor='#27272A'
						/>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
