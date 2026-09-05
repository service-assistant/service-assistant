import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
	Modal,
	Platform,
	Pressable,
	ScrollView,
	Switch,
	Text,
	TouchableOpacity,
	View,
	useWindowDimensions,
	type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppSettings, type TtsStyle, type TtsVoice } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';

const PRIMARY_ORANGE = '#FF6B00';
type TtsMode = 'off' | TtsVoice;
const TTS_MODE_OPTIONS: {
	value: TtsMode;
	label: string;
	description?: string;
}[] = [
	{ value: 'off', label: 'Wyłączone' },
	{ value: 'Algenib', label: 'Algenib', description: 'Męski, szorstki' },
	{ value: 'Leda', label: 'Leda', description: 'Kobiecy, młody' },
	{ value: 'Aoede', label: 'Aoede', description: 'Kobiecy, lekki' },
	{ value: 'Despina', label: 'Despina', description: 'Kobiecy, gładki' },
	{ value: 'Erinome', label: 'Erinome', description: 'Kobiecy, wyraźny' },
	{ value: 'Achernar', label: 'Achernar', description: 'Kobiecy, miękki' },
	{ value: 'Sulafat', label: 'Sulafat', description: 'Kobiecy, ciepły' },
	{ value: 'Vindemiatrix', label: 'Vindemiatrix', description: 'Kobiecy, łagodny' },
];
const TTS_STYLE_OPTIONS: { value: TtsStyle; label: string; description: string }[] = [
	{ value: 'neutral', label: 'Neutralny', description: 'Naturalny sposób mówienia' },
	{ value: 'warm', label: 'Ciepły', description: 'Spokojny i przyjazny' },
	{ value: 'sensual', label: 'Ekstra', description: 'Niższy ton i spokojne tempo' },
	{
		value: 'extra_sensual',
		label: 'Ekstra+',
		description: 'Wolne tempo i wyraźna ekspresja',
	},
	{
		value: 'extreme_sensual',
		label: 'Ekstra++',
		description: 'Najniższy ton, długie pauzy i pełny głos',
	},
];

function LogoutSetting({
	lightThemeEnabled,
	rowPaddingVertical,
}: {
	lightThemeEnabled: boolean;
	rowPaddingVertical: number;
}) {
	const { user, logout } = useAuth();
	const [isLoggingOut, setIsLoggingOut] = useState(false);

	const handleLogout = async () => {
		if (isLoggingOut) return;
		setIsLoggingOut(true);
		await logout();
	};

	return (
		<View
			className={`${lightThemeEnabled ? 'bg-white border-[#E4E4E7]' : 'bg-[#18181B] border-white/5'} mt-4 border rounded-[12px] overflow-hidden`}>
			<TouchableOpacity
				onPress={() => void handleLogout()}
				disabled={isLoggingOut}
				accessibilityRole='button'
				accessibilityLabel='Wyloguj się'
				activeOpacity={0.75}
				className='flex-row items-center justify-between px-4'
				style={{ paddingVertical: rowPaddingVertical }}>
				<View className='flex-row items-center flex-1 mr-4'>
					<View
						className={`w-10 h-10 rounded-[10px] ${lightThemeEnabled ? 'bg-red-50' : 'bg-red-950/40'} items-center justify-center mr-3`}>
						<Feather name='log-out' size={20} color='#EF4444' />
					</View>
					<View className='flex-1'>
						<Text
							className={`${lightThemeEnabled ? 'text-[#18181B]' : 'text-white'} text-base font-semibold`}>
							{isLoggingOut ? 'Wylogowywanie…' : 'Wyloguj się'}
						</Text>
						<Text
							numberOfLines={1}
							className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-zinc-400'} text-sm mt-1`}>
							{user
								? `${user.username} · ${user.organizationSlug}`
								: 'Zakończ bieżącą sesję.'}
						</Text>
					</View>
				</View>
				<Feather name='chevron-right' size={22} color='#EF4444' />
			</TouchableOpacity>
		</View>
	);
}

export default function SettingsScreen() {
	const router = useRouter();
	const {
		lightThemeEnabled,
		wakeWordEnabled,
		ttsEnabled,
		ttsVoice,
		ttsStyle,
		setLightThemeEnabled,
		setWakeWordEnabled,
		setTtsEnabled,
		setTtsVoice,
		setTtsStyle,
		chatMode,
		setChatMode,
	} = useAppSettings();
	const [ttsPopupPosition, setTtsPopupPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const [ttsStylePopupPosition, setTtsStylePopupPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const [selectionFeedback, setSelectionFeedback] = useState<'mode' | 'style' | null>(null);
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
	const selectedTtsMode: TtsMode = ttsEnabled ? ttsVoice : 'off';
	const selectedTtsLabel =
		TTS_MODE_OPTIONS.find((option) => option.value === selectedTtsMode)?.label ?? 'Wyłączone';
	const openTtsPopup = (pageX: number, pageY: number) => {
		const popupWidth = Math.min(240, width - 32);
		const popupHeight = Math.min(420, height - 32);
		setTtsPopupPosition({
			top:
				height - pageY >= popupHeight + 16
					? pageY + 8
					: Math.max(16, pageY - popupHeight - 8),
			left: Math.min(width - popupWidth - 16, Math.max(16, pageX - popupWidth / 2)),
		});
	};
	const selectTtsMode = (mode: TtsMode) => {
		if (mode === 'off') {
			setTtsEnabled(false);
		} else {
			setTtsVoice(mode);
			setTtsEnabled(true);
		}
		Haptics.selectionAsync().catch(() => {});
		setSelectionFeedback('mode');
		setTtsPopupPosition(null);
		setTimeout(
			() => setSelectionFeedback((current) => (current === 'mode' ? null : current)),
			180,
		);
	};
	const isTtsPopupVisible = ttsPopupPosition !== null;
	const ttsPopupWidth = Math.min(240, width - 32);
	const handleTtsSettingPress = (event: GestureResponderEvent) => {
		if (isTtsPopupVisible) {
			setTtsPopupPosition(null);
			return;
		}

		openTtsPopup(event.nativeEvent.pageX, event.nativeEvent.pageY);
	};
	const selectedTtsStyleLabel =
		TTS_STYLE_OPTIONS.find((option) => option.value === ttsStyle)?.label ?? 'Neutralny';
	const isTtsStylePopupVisible = ttsStylePopupPosition !== null;
	const openTtsStylePopup = (pageX: number, pageY: number) => {
		const popupWidth = Math.min(240, width - 32);
		const popupHeight = 286;
		setTtsStylePopupPosition({
			top:
				height - pageY >= popupHeight + 16
					? pageY + 8
					: Math.max(16, pageY - popupHeight - 8),
			left: Math.min(width - popupWidth - 16, Math.max(16, pageX - popupWidth / 2)),
		});
	};
	const handleTtsStyleSettingPress = (event: GestureResponderEvent) => {
		if (isTtsStylePopupVisible) {
			setTtsStylePopupPosition(null);
			return;
		}

		openTtsStylePopup(event.nativeEvent.pageX, event.nativeEvent.pageY);
	};
	const selectTtsStyle = (style: TtsStyle) => {
		setTtsStyle(style);
		Haptics.selectionAsync().catch(() => {});
		setSelectionFeedback('style');
		setTtsStylePopupPosition(null);
		setTimeout(
			() => setSelectionFeedback((current) => (current === 'style' ? null : current)),
			180,
		);
	};

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
						onPress={() =>
							setChatMode(chatMode === 'diagnostic' ? 'standard' : 'diagnostic')
						}
						accessibilityRole='switch'
						accessibilityState={{ checked: chatMode === 'diagnostic' }}
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
							value={chatMode === 'diagnostic'}
							onValueChange={(value) =>
								setChatMode(value ? 'diagnostic' : 'standard')
							}
							trackColor={switchTrackColor}
							thumbColor={
								chatMode === 'diagnostic' ? PRIMARY_ORANGE : inactiveThumbColor
							}
							ios_backgroundColor={switchBackgroundColor}
						/>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={() => setChatMode(chatMode === 'agent' ? 'standard' : 'agent')}
						accessibilityRole='switch'
						accessibilityState={{ checked: chatMode === 'agent' }}
						accessibilityLabel='Tryb agentowy'
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
									Tryb agentowy
								</Text>
								<Text
									className={`${lightThemeEnabled ? 'text-[#52525B]' : 'text-zinc-400'} text-sm mt-1`}>
									Model myślący
								</Text>
							</View>
						</View>
						<Switch
							value={chatMode === 'agent'}
							onValueChange={(value) => setChatMode(value ? 'agent' : 'standard')}
							trackColor={switchTrackColor}
							thumbColor={chatMode === 'agent' ? PRIMARY_ORANGE : inactiveThumbColor}
							ios_backgroundColor={switchBackgroundColor}
						/>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={handleTtsSettingPress}
						accessibilityRole='button'
						accessibilityState={{ expanded: isTtsPopupVisible }}
						accessibilityLabel='Czytanie odpowiedzi na głos'
						activeOpacity={0.75}
						className={`flex-row items-center justify-between px-4 border-b ${rowBorderClassName}`}
						style={{ paddingVertical: rowPaddingVertical }}>
						<View className='flex-row items-center flex-1 mr-2' style={{ minWidth: 0 }}>
							<View
								className={`w-10 h-10 rounded-[10px] ${iconBackgroundClassName} items-center justify-center mr-3`}>
								<Feather name='volume-2' size={20} color={PRIMARY_ORANGE} />
							</View>
							<Text
								className={`${rowTitleClassName} text-base font-semibold flex-1 pr-2`}
								style={{ flexShrink: 1 }}>
								Czytanie odpowiedzi na głos
							</Text>
						</View>
						<View className='flex-row items-center' style={{ flexShrink: 0 }}>
							<Text
								numberOfLines={1}
								className={`${
									selectionFeedback === 'mode'
										? lightThemeEnabled
											? 'text-[#18181B]'
											: 'text-white'
										: lightThemeEnabled
											? 'text-[#52525B]'
											: 'text-zinc-300'
								} text-sm font-medium mr-2`}>
								{selectedTtsLabel}
							</Text>
							<Feather
								name={isTtsPopupVisible ? 'chevron-up' : 'chevron-down'}
								size={22}
								color={lightThemeEnabled ? '#52525B' : '#A1A1AA'}
							/>
						</View>
					</TouchableOpacity>

					<TouchableOpacity
						onPress={handleTtsStyleSettingPress}
						accessibilityRole='button'
						accessibilityState={{ expanded: isTtsStylePopupVisible }}
						accessibilityLabel='Styl głosu'
						activeOpacity={0.75}
						className='flex-row items-center justify-between px-4'
						style={{ paddingVertical: rowPaddingVertical }}>
						<View className='flex-row items-center flex-1 mr-2' style={{ minWidth: 0 }}>
							<View
								className={`w-10 h-10 rounded-[10px] ${iconBackgroundClassName} items-center justify-center mr-3`}>
								<Feather name='sliders' size={20} color={PRIMARY_ORANGE} />
							</View>
							<Text
								className={`${rowTitleClassName} text-base font-semibold flex-1 pr-2`}
								style={{ flexShrink: 1 }}>
								Styl głosu
							</Text>
						</View>
						<View className='flex-row items-center' style={{ flexShrink: 0 }}>
							<Text
								numberOfLines={1}
								className={`${
									selectionFeedback === 'style'
										? lightThemeEnabled
											? 'text-[#18181B]'
											: 'text-white'
										: lightThemeEnabled
											? 'text-[#52525B]'
											: 'text-zinc-300'
								} text-sm font-medium mr-2`}>
								{selectedTtsStyleLabel}
							</Text>
							<Feather
								name={isTtsStylePopupVisible ? 'chevron-up' : 'chevron-down'}
								size={22}
								color={lightThemeEnabled ? '#52525B' : '#A1A1AA'}
							/>
						</View>
					</TouchableOpacity>
				</View>

				{Platform.OS === 'web' || Platform.OS === 'android' ? (
					<LogoutSetting
						lightThemeEnabled={lightThemeEnabled}
						rowPaddingVertical={rowPaddingVertical}
					/>
				) : null}
			</ScrollView>

			<Modal
				transparent
				visible={isTtsPopupVisible}
				animationType='none'
				onRequestClose={() => setTtsPopupPosition(null)}
				statusBarTranslucent>
				<View className='flex-1'>
					<Pressable
						onPress={() => setTtsPopupPosition(null)}
						accessibilityRole='button'
						accessibilityLabel='Zamknij wybór głosu'
						className='absolute inset-0 bg-black/10'
					/>
					{ttsPopupPosition ? (
						<View
							accessibilityRole='radiogroup'
							className={`absolute overflow-hidden rounded-[12px] border shadow-lg ${
								lightThemeEnabled
									? 'bg-white border-[#E4E4E7]'
									: 'bg-[#27272A] border-[#3F3F46]'
							}`}
							style={{
								top: ttsPopupPosition.top,
								left: ttsPopupPosition.left,
								width: ttsPopupWidth,
								maxHeight: Math.min(420, height - 32),
							}}>
							<ScrollView showsVerticalScrollIndicator nestedScrollEnabled>
								{TTS_MODE_OPTIONS.map((option, index) => {
									const isSelected = selectedTtsMode === option.value;

									return (
										<View key={option.value}>
											<Pressable
												onPress={() => selectTtsMode(option.value)}
												accessibilityRole='radio'
												accessibilityState={{ checked: isSelected }}
												accessibilityLabel={option.label}
												className={`flex-row items-center px-4 py-3 ${
													index < TTS_MODE_OPTIONS.length - 1
														? `border-b ${rowBorderClassName}`
														: ''
												} ${isSelected ? (lightThemeEnabled ? 'bg-[#FFF7ED]' : 'bg-[#26170D]') : ''}`}>
												<View className='flex-1'>
													<Text
														className={`text-[15px] font-semibold ${
															isSelected
																? 'text-[#FF6B00]'
																: rowTitleClassName
														}`}>
														{option.label}
													</Text>
													{option.description ? (
														<Text
															className={`${lightThemeEnabled ? 'text-[#71717A]' : 'text-zinc-400'} text-xs mt-0.5`}>
															{option.description}
														</Text>
													) : null}
												</View>
												{isSelected ? (
													<Feather
														name='check'
														size={19}
														color={PRIMARY_ORANGE}
													/>
												) : null}
											</Pressable>
										</View>
									);
								})}
							</ScrollView>
						</View>
					) : null}
				</View>
			</Modal>

			<Modal
				transparent
				visible={isTtsStylePopupVisible}
				animationType='none'
				onRequestClose={() => setTtsStylePopupPosition(null)}
				statusBarTranslucent>
				<View className='flex-1'>
					<Pressable
						onPress={() => setTtsStylePopupPosition(null)}
						accessibilityRole='button'
						accessibilityLabel='Zamknij wybór stylu głosu'
						className='absolute inset-0 bg-black/10'
					/>
					{ttsStylePopupPosition ? (
						<View
							accessibilityRole='radiogroup'
							className={`absolute overflow-hidden rounded-[12px] border shadow-lg ${
								lightThemeEnabled
									? 'bg-white border-[#E4E4E7]'
									: 'bg-[#27272A] border-[#3F3F46]'
							}`}
							style={{
								top: ttsStylePopupPosition.top,
								left: ttsStylePopupPosition.left,
								width: ttsPopupWidth,
							}}>
							{TTS_STYLE_OPTIONS.map((option, index) => {
								const isSelected = ttsStyle === option.value;

								return (
									<View key={option.value}>
										<Pressable
											onPress={() => selectTtsStyle(option.value)}
											accessibilityRole='radio'
											accessibilityState={{ checked: isSelected }}
											accessibilityLabel={option.label}
											className={`flex-row items-center px-4 py-3 ${
												index < TTS_STYLE_OPTIONS.length - 1
													? `border-b ${rowBorderClassName}`
													: ''
											} ${isSelected ? (lightThemeEnabled ? 'bg-[#FFF7ED]' : 'bg-[#26170D]') : ''}`}>
											<View className='flex-1'>
												<Text
													className={`text-[15px] font-semibold ${
														isSelected
															? 'text-[#FF6B00]'
															: rowTitleClassName
													}`}>
													{option.label}
												</Text>
												<Text
													className={`${lightThemeEnabled ? 'text-[#71717A]' : 'text-zinc-400'} text-xs mt-0.5`}>
													{option.description}
												</Text>
											</View>
											{isSelected ? (
												<Feather
													name='check'
													size={19}
													color={PRIMARY_ORANGE}
												/>
											) : null}
										</Pressable>
									</View>
								);
							})}
						</View>
					) : null}
				</View>
			</Modal>
		</SafeAreaView>
	);
}
