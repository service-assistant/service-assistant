import React, { useState } from 'react';
import {
	ActivityIndicator,
	Image,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';

export const FILTER_LOGO_SIZES: Record<string, { width: number; height: number }> = {
	TOYOTA: { width: 96, height: 26 },
	DIECI: { width: 72, height: 26 },
	UNICARRIERS: { width: 132, height: 26 },
	TCM: { width: 60, height: 26 },
	STILL: { width: 60, height: 26 },
	JUNGHEINRICH: { width: 132, height: 26 },
	DEFAULT: { width: 84, height: 26 },
};

type FilterBrand = {
	name: string;
	logo_url: string | null;
};

type FilterDeviceType = {
	name: string;
};

type VehicleFiltersProps = {
	brands: FilterBrand[];
	deviceTypes: FilterDeviceType[];
	activeBrandFilter: string;
	activeTypeFilter: string;
	onBrandFilterChange: (brandName: string) => void;
	onTypeFilterChange: (typeName: string) => void;
	useTabletRefresh: boolean;
	isLoadingBrands?: boolean;
	isLoadingTypes?: boolean;
	primaryColor?: string;
};

const ALL_FILTER_LABEL = 'WSZYSTKIE';

const androidTextStyle =
	Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {};

const BrandLogoOrText: React.FC<{ brandName: string; logoUrl: string | null; active: boolean }> = ({
	brandName,
	logoUrl,
	active,
}) => {
	const [imageError, setImageError] = useState(false);

	if (brandName === ALL_FILTER_LABEL) {
		return (
			<Text
				className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
				style={androidTextStyle as any}>
				{brandName}
			</Text>
		);
	}

	if (logoUrl && !imageError) {
		const dims = FILTER_LOGO_SIZES[brandName.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;
		return (
			<Image
				source={{ uri: logoUrl }}
				style={{ width: dims.width, height: dims.height }}
				resizeMode='contain'
				onError={() => setImageError(true)}
			/>
		);
	}

	return (
		<Text
			className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
			style={androidTextStyle as any}>
			{brandName.toUpperCase()}
		</Text>
	);
};

export default function VehicleFilters({
	brands,
	deviceTypes,
	activeBrandFilter,
	activeTypeFilter,
	onBrandFilterChange,
	onTypeFilterChange,
	useTabletRefresh,
	isLoadingBrands = false,
	isLoadingTypes = false,
	primaryColor = '#FF6B00',
}: VehicleFiltersProps) {
	const brandFilterOptions = [{ name: ALL_FILTER_LABEL, logo_url: null }, ...brands];
	const typeFilterOptions = [{ name: ALL_FILTER_LABEL }, ...deviceTypes];
	const filterLabelClassName = `text-gray-400 font-bold uppercase tracking-widest ml-2 ${
		useTabletRefresh ? 'text-[12px] mb-1' : 'text-sm mb-2'
	}`;
	const getFilterChipStyle = (active: boolean) =>
		useTabletRefresh
			? {
					height: 42,
					paddingHorizontal: 20,
					paddingVertical: 0,
					marginRight: 12,
					backgroundColor: active ? 'rgba(255, 107, 0, 0.16)' : '#242428',
					borderWidth: 1,
					borderColor: active ? primaryColor : 'rgba(255, 255, 255, 0.07)',
				}
			: {
					backgroundColor: active ? primaryColor : '#27272a',
				};
	const loadingStyle = {
		alignSelf: 'flex-start' as const,
		marginVertical: 12,
		marginLeft: 8,
	};
	const chipClassName = `rounded-full justify-center items-center flex-row ${
		useTabletRefresh ? '' : 'px-6 py-3 mr-4 min-h-[48px]'
	}`;

	return (
		<>
			<View style={{ marginBottom: useTabletRefresh ? 8 : 12 }}>
				<Text className={filterLabelClassName}>Marka</Text>
				{isLoadingBrands ? (
					<ActivityIndicator size='small' color={primaryColor} style={loadingStyle} />
				) : (
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{brandFilterOptions.map((brand) => (
							<TouchableOpacity
								key={brand.name}
								onPress={() => onBrandFilterChange(brand.name)}
								style={getFilterChipStyle(activeBrandFilter === brand.name)}
								className={chipClassName}>
								<BrandLogoOrText
									brandName={brand.name}
									logoUrl={brand.logo_url}
									active={activeBrandFilter === brand.name}
								/>
							</TouchableOpacity>
						))}
					</ScrollView>
				)}
			</View>

			<View className='mb-0'>
				<Text className={filterLabelClassName}>Typ</Text>
				{isLoadingTypes ? (
					<ActivityIndicator size='small' color={primaryColor} style={loadingStyle} />
				) : (
					<ScrollView horizontal showsHorizontalScrollIndicator={false}>
						{typeFilterOptions.map((type) => (
							<TouchableOpacity
								key={type.name}
								onPress={() => onTypeFilterChange(type.name)}
								style={getFilterChipStyle(activeTypeFilter === type.name)}
								className={chipClassName}>
								<Text
									className={`text-sm font-bold uppercase ${
										activeTypeFilter === type.name
											? 'text-white'
											: 'text-gray-300'
									}`}
									style={androidTextStyle as any}>
									{type.name}
								</Text>
							</TouchableOpacity>
						))}
					</ScrollView>
				)}
			</View>
		</>
	);
}
