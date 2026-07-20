import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
	const {
		lightThemeEnabled,
		wakeWordEnabled,
		ttsEnabled,
		diagnosticModeEnabled,
		setLightThemeEnabled,
		setWakeWordEnabled,
		setTtsEnabled,
		setDiagnosticModeEnabled,
	} = useAppSettings();
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

	const switchTrackColor = lightThemeEnabled
		? { false: '#D4D4D8', true: '#FDBA74' }
		: { false: '#27272A', true: '#8A3D00' };
	const rowBorderClassName = lightThemeEnabled ? 'border-[#E4E4E7]' : 'border-white/5';
	const rowTitleClassName = lightThemeEnabled ? 'text-[#18181B]' : 'text-white';
	const iconBackgroundClassName = lightThemeEnabled ? 'bg-[#FFF7ED]' : 'bg-[#26170D]';
	const inactiveThumbColor = lightThemeEnabled ? '#71717A' : '#A1A1AA';
	const switchBackgroundColor = lightThemeEnabled ? '#D4D4D8' : '#27272A';

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
						className={`flex-row items-center justify-center mr-5 border rounded-[10px] ${
							lightThemeEnabled
								? 'border-[#E4E4E7] bg-white'
								: 'border-[#2A2A2A] bg-[#0D0D0D]'
						}`}
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
					<Text
						className={`${headerTitleClassName} ${lightThemeEnabled ? 'text-[#18181B]' : 'text-white'} font-bold`}>
						Ustawienia
					</Text>
				</View>

				<View
					className={`${lightThemeEnabled ? 'bg-white border-[#E4E4E7]' : 'bg-[#18181B] border-white/5'} border rounded-[12px] overflow-hidden`}>
					<TouchableOpacity
						onPress={() => setLightThemeEnabled(!lightThemeEnabled)}
						accessibilityRole='switch'
						accessibilityState={{ checked: lightThemeEnabled }}
						accessibilityLabel='Jasny motyw'
						activeOpacity={0.75}
						className={`flex-row items-center justify-between px-4 border-b ${rowBorderClassName}`}
						style={{ paddingVertical: rowPaddingVertical }}>
						<View className='flex-row items-center flex-1 mr-4'>
							<View
								className={`w-10 h-10 rounded-[10px] ${iconBackgroundClassName} items-center justify-center mr-3`}>
								<Feather name='sun' size={20} color={PRIMARY_ORANGE} />
							</View>
							<View className='flex-1'>
								<Text className={`${rowTitleClassName} text-base font-semibold`}>
									Jasny motyw
								</Text>
								<Text
									className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-zinc-400'} text-sm mt-1`}>
									Przełącza wygląd aplikacji między jasnym i ciemnym.
								</Text>
							</View>
						</View>
						<Switch
							value={lightThemeEnabled}
							onValueChange={setLightThemeEnabled}
							trackColor={switchTrackColor}
							thumbColor={lightThemeEnabled ? PRIMARY_ORANGE : inactiveThumbColor}
							ios_backgroundColor={switchBackgroundColor}
						/>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => setWakeWordEnabled(!wakeWordEnabled)}
						accessibilityRole='switch'
						accessibilityState={{ checked: wakeWordEnabled }}
						accessibilityLabel='Słowo wybudzające eksperymentalne'
						activeOpacity={0.75}
						className={`flex-row items-center justify-between px-4 border-b ${rowBorderClassName}`}
						style={{ paddingVertical: rowPaddingVertical }}>
						<View className='flex-row items-center flex-1 mr-4'>
							<View
								className={`w-10 h-10 rounded-[10px] ${iconBackgroundClassName} items-center justify-center mr-3`}>
								<Feather name='mic' size={20} color={PRIMARY_ORANGE} />
							</View>
							<Text className={`${rowTitleClassName} text-base font-semibold flex-1`}>
								Słowo wybudzające (eksperymentalne)
							</Text>
						</View>
						<Switch
							value={wakeWordEnabled}
							onValueChange={setWakeWordEnabled}
							trackColor={switchTrackColor}
							thumbColor={wakeWordEnabled ? PRIMARY_ORANGE : inactiveThumbColor}
							ios_backgroundColor={switchBackgroundColor}
						/>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => setDiagnosticModeEnabled(!diagnosticModeEnabled)}
						accessibilityRole='switch'
						accessibilityState={{ checked: diagnosticModeEnabled }}
						accessibilityLabel='Tryb diagnostyczny Next Best Step'
						activeOpacity={0.75}
						className={`flex-row items-center justify-between px-4 border-b ${rowBorderClassName}`}
						style={{ paddingVertical: rowPaddingVertical }}>
						<View className='flex-row items-center flex-1 mr-4'>
							<View
								className={`w-10 h-10 rounded-[10px] ${iconBackgroundClassName} items-center justify-center mr-3`}>
								<Feather name='tool' size={20} color={PRIMARY_ORANGE} />
							</View>
							<View className='flex-1'>
								<Text className={`${rowTitleClassName} text-base font-semibold`}>
									Tryb diagnostyczny
								</Text>
								<Text
									className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-zinc-400'} text-sm mt-1`}>
									Prowadzi technika krok po kroku i pokazuje jedną akcję naraz.
								</Text>
							</View>
						</View>
						<Switch
							value={diagnosticModeEnabled}
							onValueChange={setDiagnosticModeEnabled}
							trackColor={switchTrackColor}
							thumbColor={diagnosticModeEnabled ? PRIMARY_ORANGE : inactiveThumbColor}
							ios_backgroundColor={switchBackgroundColor}
						/>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => setTtsEnabled(!ttsEnabled)}
						accessibilityRole='switch'
						accessibilityState={{ checked: ttsEnabled }}
						accessibilityLabel='Czytanie odpowiedzi na głos'
						activeOpacity={0.75}
						className='flex-row items-center justify-between px-4'
						style={{ paddingVertical: rowPaddingVertical }}>
						<View className='flex-row items-center flex-1 mr-4'>
							<View
								className={`w-10 h-10 rounded-[10px] ${iconBackgroundClassName} items-center justify-center mr-3`}>
								<Feather name='volume-2' size={20} color={PRIMARY_ORANGE} />
							</View>
							<Text className={`${rowTitleClassName} text-base font-semibold flex-1`}>
								Czytanie odpowiedzi na głos
							</Text>
						</View>
						<Switch
							value={ttsEnabled}
							onValueChange={setTtsEnabled}
							trackColor={switchTrackColor}
							thumbColor={ttsEnabled ? PRIMARY_ORANGE : inactiveThumbColor}
							ios_backgroundColor={switchBackgroundColor}
						/>
					</TouchableOpacity>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
