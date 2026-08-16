import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import type { NameplateData } from '@/types/nameplate';

type MachineInfoPanelProps = {
	showMachineInfoPanel: boolean;
	deviceName: string;
	nameplateData: NameplateData | null;
	fullScreen?: boolean;
	topInset?: number;
	headerHeight?: number;
	headerPaddingTop?: number;
	headerTitleFontSize?: number;
	headerTitleLineHeight?: number;
	backButtonSize?: number;
	backIconSize?: number;
	lightMode?: boolean;
	onClose: () => void;
};

export default function MachineInfoPanel({
	showMachineInfoPanel,
	deviceName,
	nameplateData,
	fullScreen = false,
	topInset = 0,
	headerHeight,
	headerPaddingTop,
	headerTitleFontSize,
	headerTitleLineHeight,
	backButtonSize = fullScreen ? 42 : 48,
	backIconSize = fullScreen ? 21 : 23,
	lightMode = false,
	onClose,
}: MachineInfoPanelProps) {
	if (!showMachineInfoPanel) return null;

	const foreground = lightMode ? '#18181B' : '#FFFFFF';
	const muted = lightMode ? '#52525B' : '#A1A1AA';
	const panel = lightMode ? '#FFFFFF' : '#18181B';
	const border = lightMode ? '#E4E4E7' : '#3F3F46';
	const headerSafeTop = fullScreen ? topInset : 0;
	const resolvedHeaderHeight = headerHeight ?? (fullScreen ? 64 + headerSafeTop : 76);
	const resolvedHeaderPaddingTop = headerPaddingTop ?? headerSafeTop;
	const resolvedHeaderTitleFontSize = headerTitleFontSize ?? (fullScreen ? 16 : 20);
	const resolvedHeaderTitleLineHeight = headerTitleLineHeight ?? resolvedHeaderTitleFontSize + 5;

	return (
		<View className='absolute inset-0 flex-row' style={{ zIndex: 50, elevation: 50 }}>
			{fullScreen ? null : (
				<TouchableOpacity
					activeOpacity={1}
					onPress={onClose}
					accessibilityRole='button'
					accessibilityLabel='Zamknij informacje o maszynie'
					style={{ width: '40%', backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
				/>
			)}
			<View
				className={`relative ${
					lightMode ? 'bg-[#F7F7F8]' : 'bg-[#07080A]'
				} ${fullScreen ? '' : lightMode ? 'border-l border-[#E4E4E7]' : 'border-l border-white/10'}`}
				style={{
					width: fullScreen ? '100%' : '60%',
					shadowColor: '#000000',
					shadowOpacity: 0.35,
					shadowRadius: 24,
					shadowOffset: { width: -10, height: 0 },
				}}>
				<View
					className={`flex-row items-center px-4 border-b ${
						lightMode ? 'bg-white border-[#E4E4E7]' : 'bg-[#0D0D0D] border-[#1F1F1F]'
					}`}
					style={{
						height: resolvedHeaderHeight,
						paddingTop: resolvedHeaderPaddingTop,
					}}>
					<TouchableOpacity
						onPress={onClose}
						accessibilityRole='button'
						accessibilityLabel='Wstecz'
						className={`border rounded-[10px] items-center justify-center ${
							lightMode
								? 'border-[#E4E4E7] bg-white'
								: 'border-[#2A2A2A] bg-[#0D0D0D]'
						}`}
						style={{ width: backButtonSize, height: backButtonSize }}>
						<Feather name='arrow-left' size={backIconSize} color='#FF7A00' />
					</TouchableOpacity>
					<Text
						className={`flex-1 text-center font-bold ${lightMode ? 'text-[#18181B]' : 'text-white'}`}
						style={{
							fontSize: resolvedHeaderTitleFontSize,
							lineHeight: resolvedHeaderTitleLineHeight,
						}}
						numberOfLines={1}>
						O MASZYNIE
					</Text>
					<View style={{ width: backButtonSize, height: backButtonSize }} />
				</View>

				<ScrollView
					className='flex-1'
					contentContainerStyle={{ padding: fullScreen ? 16 : 24, paddingBottom: 32 }}>
					<View
						className='rounded-[16px] border p-5 mb-4'
						style={{ backgroundColor: panel, borderColor: border }}>
						<Text className='text-sm mb-1' style={{ color: muted }}>
							Pojazd z katalogu
						</Text>
						<Text className='text-xl font-bold' style={{ color: foreground }}>
							{deviceName}
						</Text>
						{nameplateData ? (
							<>
								<Text className='text-sm mt-5 mb-1' style={{ color: muted }}>
									Model z tabliczki
								</Text>
								<Text className='text-lg font-bold text-[#FF6B00]'>
									{nameplateData.model}
								</Text>
							</>
						) : null}
					</View>

					{nameplateData ? (
						nameplateData.attributes.map((attribute, index) => (
							<View
								key={`${attribute.label}-${attribute.value}-${index}`}
								className='flex-row items-start border-b py-4'
								style={{ borderColor: border }}>
								<Text className='flex-1 pr-4' style={{ color: muted }}>
									{attribute.label}
								</Text>
								<View className='flex-1 items-end'>
									<Text
										className='font-semibold text-right'
										style={{ color: foreground }}>
										{attribute.value}
										{attribute.unit ? ` ${attribute.unit}` : ''}
									</Text>
									{attribute.confidence != null && attribute.confidence < 0.7 ? (
										<Text className='text-xs mt-1 text-[#F59E0B]'>
											Niska pewność odczytu
										</Text>
									) : null}
								</View>
							</View>
						))
					) : (
						<Text className='text-center py-10' style={{ color: muted }}>
							Brak danych z tabliczki dla tej rozmowy.
						</Text>
					)}
				</ScrollView>
			</View>
		</View>
	);
}
