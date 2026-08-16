import React, { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle, View } from 'react-native';

import VehicleFilters from '@/components/vehicles/VehicleFilters';
import type { ResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { Category } from '@/hooks/use-vehicle-metadata';

const LARGE_LAYOUT_CONFIG = {
	paddingHorizontal: 20,
	paddingVertical: 10,
	useCompactFilters: true,
} as const;

const LAYOUT_CONFIG = {
	largePortrait: LARGE_LAYOUT_CONFIG,
	largeLandscape: LARGE_LAYOUT_CONFIG,
	compactPortrait: {
		paddingHorizontal: 16,
		paddingVertical: 10,
		useCompactFilters: true,
	},
	compactLandscape: {
		paddingHorizontal: 16,
		paddingVertical: 16,
		useCompactFilters: false,
	},
} as const satisfies Record<ResponsiveLayout, object>;

export type VehicleListHeaderRenderProps = {
	layout: ResponsiveLayout;
};

export type VehicleListHeaderBaseProps = {
	categories: Category[];
	selectedCategoryIds: number[];
	onCategoryPathChange: (categoryIds: number[]) => void;
	isLoadingCategories: boolean;
	layout: ResponsiveLayout;
	lightMode: boolean;
};

type VehicleListHeaderProps = VehicleListHeaderBaseProps & {
	renderTopRow: (props: VehicleListHeaderRenderProps) => ReactNode;
	containerStyle?: StyleProp<ViewStyle>;
};

export default function VehicleListHeader({
	categories,
	selectedCategoryIds,
	onCategoryPathChange,
	isLoadingCategories,
	layout,
	lightMode,
	renderTopRow,
	containerStyle,
}: VehicleListHeaderProps) {
	const config = LAYOUT_CONFIG[layout];

	return (
		<View
			style={[
				{
					paddingHorizontal: config.paddingHorizontal,
					paddingTop: config.paddingVertical,
					paddingBottom: config.paddingVertical,
				},
				containerStyle,
			]}>
			{renderTopRow({ layout })}
			<VehicleFilters
				categories={categories}
				selectedCategoryIds={selectedCategoryIds}
				onCategoryPathChange={onCategoryPathChange}
				useCompactLayout={config.useCompactFilters}
				isLoading={isLoadingCategories}
				primaryColor='#FF6B00'
				lightMode={lightMode}
			/>
		</View>
	);
}
