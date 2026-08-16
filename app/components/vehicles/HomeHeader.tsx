import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import ThemeAwareLogo from '@/components/ui/ThemeAwareLogo';
import VehicleListHeader, {
	type VehicleListHeaderBaseProps,
} from '@/components/vehicles/VehicleListHeader';
import type { ResponsiveLayout } from '@/hooks/use-responsive-layout';

const LARGE_HEADER_CONFIG = {
	logoHeight: 40,
	logoWidth: 68,
	titleClassName: 'text-3xl',
	topRowHeight: 44,
	topRowMarginBottom: 12,
	titleOffsetY: 8,
	buttonOffsetY: 8,
	buttonHeight: 44,
	buttonLabelPaddingHorizontal: 16,
	gapClassName: 'gap-3',
	logoMarginClassName: 'mr-3',
} as const;

const HEADER_CONFIG = {
	largePortrait: { ...LARGE_HEADER_CONFIG, iconOnlyButtons: true },
	largeLandscape: { ...LARGE_HEADER_CONFIG, iconOnlyButtons: false },
	compactPortrait: {
		logoHeight: 34,
		logoWidth: 54,
		titleClassName: 'text-2xl',
		topRowHeight: undefined,
		topRowMarginBottom: 12,
		titleOffsetY: 0,
		buttonOffsetY: 0,
		buttonHeight: 42,
		buttonLabelPaddingHorizontal: 18,
		gapClassName: 'gap-2',
		logoMarginClassName: 'mr-2',
		iconOnlyButtons: true,
	},
	compactLandscape: {
		logoHeight: 38,
		logoWidth: 60,
		titleClassName: 'text-2xl',
		topRowHeight: undefined,
		topRowMarginBottom: 16,
		titleOffsetY: 0,
		buttonOffsetY: 0,
		buttonHeight: 48,
		buttonLabelPaddingHorizontal: 18,
		gapClassName: 'gap-3',
		logoMarginClassName: 'mr-3',
		iconOnlyButtons: false,
	},
} as const satisfies Record<ResponsiveLayout, object>;

type HomeHeaderProps = VehicleListHeaderBaseProps & {
	onOpenSettings: () => void;
	onOpenHistory: () => void;
};

export default function HomeHeader({
	onOpenSettings,
	onOpenHistory,
	...headerProps
}: HomeHeaderProps) {
	const { lightMode } = headerProps;

	return (
		<VehicleListHeader
			{...headerProps}
			containerStyle={{
				backgroundColor: lightMode ? '#FFFFFF' : '#09090B',
				borderBottomWidth: 1,
				borderBottomColor: lightMode ? '#E4E4E7' : '#09090B',
			}}
			renderTopRow={({ layout }) => {
				const header = HEADER_CONFIG[layout];
				const buttonPaddingHorizontal = header.iconOnlyButtons
					? 0
					: header.buttonLabelPaddingHorizontal;

				return (
					<View
						className={`flex-row justify-between items-center ${header.gapClassName}`}
						style={{
							minHeight: header.topRowHeight,
							marginBottom: header.topRowMarginBottom,
						}}>
						<View
							className='flex-row items-center flex-1 min-w-0'
							style={{ transform: [{ translateY: header.titleOffsetY }] }}>
							<View className={header.logoMarginClassName}>
								<ThemeAwareLogo
									source={require('../../assets/images/fixo3.png')}
									width={header.logoWidth}
									height={header.logoHeight}
									lightMode={lightMode}
									resizeMode='contain'
								/>
							</View>
							<Text
								className={`${header.titleClassName} ${lightMode ? 'text-[#18181B]' : 'text-white'} font-bold flex-1`}
								numberOfLines={1}
								adjustsFontSizeToFit>
								Wybierz Pojazd
							</Text>
						</View>
						<View className={`flex-row items-center ${header.gapClassName}`}>
							<HeaderButton
								icon='cog-outline'
								label='USTAWIENIA'
								accessibilityLabel='Ustawienia'
								onPress={onOpenSettings}
								lightMode={lightMode}
								iconOnly={header.iconOnlyButtons}
								height={header.buttonHeight}
								paddingHorizontal={buttonPaddingHorizontal}
								offsetY={header.buttonOffsetY}
							/>
							<HeaderButton
								icon='history'
								label='HISTORIA CZATÓW'
								accessibilityLabel='Historia czatów'
								onPress={onOpenHistory}
								lightMode={lightMode}
								iconOnly={header.iconOnlyButtons}
								height={header.buttonHeight}
								paddingHorizontal={buttonPaddingHorizontal}
								offsetY={header.buttonOffsetY}
							/>
						</View>
					</View>
				);
			}}
		/>
	);
}

type HeaderButtonProps = {
	icon: 'cog-outline' | 'history';
	label: string;
	accessibilityLabel: string;
	onPress: () => void;
	lightMode: boolean;
	iconOnly: boolean;
	height: number;
	paddingHorizontal: number;
	offsetY: number;
};

function HeaderButton({
	icon,
	label,
	accessibilityLabel,
	onPress,
	lightMode,
	iconOnly,
	height,
	paddingHorizontal,
	offsetY,
}: HeaderButtonProps) {
	return (
		<TouchableOpacity
			onPress={onPress}
			accessibilityRole='button'
			accessibilityLabel={accessibilityLabel}
			className={`flex-row items-center justify-center border rounded-[10px] ${
				lightMode ? 'border-[#E4E4E7] bg-[#FAFAFA]' : 'border-[#2A2A2A] bg-[#111111]'
			}`}
			style={{
				height,
				width: iconOnly ? height : undefined,
				paddingHorizontal,
				transform: [{ translateY: offsetY }],
			}}>
			<MaterialCommunityIcons name={icon} size={21} color='#FF7A00' />
			{iconOnly ? null : (
				<Text
					className={`${lightMode ? 'text-[#3F3F46]' : 'text-[#E6E6E6]'} ml-4 text-[13px] font-semibold tracking-wider`}>
					{label}
				</Text>
			)}
		</TouchableOpacity>
	);
}
