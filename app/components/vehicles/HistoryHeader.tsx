import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import VehicleListHeader, {
	type VehicleListHeaderBaseProps,
} from '@/components/vehicles/VehicleListHeader';
import type { ResponsiveLayout } from '@/hooks/use-responsive-layout';

const LARGE_HEADER_CONFIG = {
	titleClassName: 'text-3xl',
	minHeight: 44,
	marginBottom: 12,
	backButtonHeight: 48,
	backButtonIconOnly: false,
	backButtonMarginRight: 20,
} as const;

const HEADER_CONFIG = {
	largePortrait: LARGE_HEADER_CONFIG,
	largeLandscape: LARGE_HEADER_CONFIG,
	compactPortrait: {
		titleClassName: 'text-2xl',
		minHeight: 38,
		marginBottom: 12,
		backButtonHeight: 42,
		backButtonIconOnly: true,
		backButtonMarginRight: 4,
	},
	compactLandscape: {
		titleClassName: 'text-2xl',
		minHeight: 38,
		marginBottom: 16,
		backButtonHeight: 48,
		backButtonIconOnly: false,
		backButtonMarginRight: 20,
	},
} as const satisfies Record<ResponsiveLayout, object>;

type HistoryHeaderProps = VehicleListHeaderBaseProps & {
	onBack: () => void;
};

export default function HistoryHeader({ onBack, ...headerProps }: HistoryHeaderProps) {
	const { lightMode } = headerProps;

	return (
		<VehicleListHeader
			{...headerProps}
			containerStyle={{ paddingBottom: 0 }}
			renderTopRow={({ layout }) => {
				const header = HEADER_CONFIG[layout];

				return (
					<View
						className='flex-row items-center gap-3'
						style={{ minHeight: header.minHeight, marginBottom: header.marginBottom }}>
						<TouchableOpacity
							onPress={onBack}
							accessibilityRole='button'
							accessibilityLabel='Wstecz'
							className={`flex-row items-center justify-center border rounded-[10px] ${
								lightMode
									? 'border-[#E4E4E7] bg-white'
									: 'border-[#2A2A2A] bg-[#0D0D0D]'
							}`}
							style={{
								height: header.backButtonHeight,
								width: header.backButtonIconOnly
									? header.backButtonHeight
									: undefined,
								marginRight: header.backButtonMarginRight,
								paddingHorizontal: header.backButtonIconOnly ? 0 : 18,
							}}>
							<Feather
								name='arrow-left'
								size={header.backButtonIconOnly ? 21 : 22}
								color='#FF7A00'
							/>
							{header.backButtonIconOnly ? null : (
								<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
									WSTECZ
								</Text>
							)}
						</TouchableOpacity>
						<Text
							className={`${header.titleClassName} ${lightMode ? 'text-[#18181B]' : 'text-white'} font-bold flex-1`}
							numberOfLines={1}
							adjustsFontSizeToFit>
							Historia czatów
						</Text>
					</View>
				);
			}}
		/>
	);
}
