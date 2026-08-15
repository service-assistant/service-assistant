import React, { useState } from 'react';
import {
	ActivityIndicator,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';

import ThemeAwareLogo from '@/components/ThemeAwareLogo';
import type { Category } from '@/hooks/use-vehicle-metadata';

export const FILTER_LOGO_SIZES: Record<string, { width: number; height: number }> = {
	TOYOTA: { width: 96, height: 26 },
	DIECI: { width: 72, height: 26 },
	UNICARRIERS: { width: 132, height: 26 },
	TCM: { width: 60, height: 26 },
	STILL: { width: 60, height: 26 },
	JUNGHEINRICH: { width: 132, height: 26 },
	DEFAULT: { width: 84, height: 26 },
};

type VehicleFiltersProps = {
	categories: Category[];
	selectedCategoryIds: number[];
	onCategoryPathChange: (categoryIds: number[]) => void;
	useTabletRefresh: boolean;
	isLoading?: boolean;
	primaryColor?: string;
	lightMode?: boolean;
};

const ALL_FILTER_LABEL = 'WSZYSTKIE';
const androidTextStyle =
	Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {};
const singleLineTextStyle = Platform.OS === 'web' ? { whiteSpace: 'nowrap' as const } : {};

const CategoryLogoOrText: React.FC<{
	category: Category;
	active: boolean;
	lightMode: boolean;
}> = ({ category, active, lightMode }) => {
	const [imageError, setImageError] = useState(false);
	if (category.image_url && !imageError) {
		const dims = FILTER_LOGO_SIZES[category.name.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;
		return (
			<ThemeAwareLogo
				source={{ uri: category.image_url }}
				width={dims.width}
				height={dims.height}
				lightMode={lightMode}
				resizeMode='contain'
				onError={() => setImageError(true)}
			/>
		);
	}
	return (
		<Text
			numberOfLines={1}
			className={`text-sm font-bold uppercase ${
				lightMode
					? active
						? 'text-[#C65300]'
						: 'text-[#3F3F46]'
					: active
						? 'text-white'
						: 'text-gray-300'
			}`}
			style={[androidTextStyle, singleLineTextStyle, { flexShrink: 0 }] as any}>
			{category.name}
		</Text>
	);
};

const LEVEL_LABELS = ['Marka', 'Typ maszyny', 'Model / wariant'] as const;

const getLevelLabel = (level: number) => LEVEL_LABELS[level] ?? 'Szczegóły';

export default function VehicleFilters({
	categories,
	selectedCategoryIds,
	onCategoryPathChange,
	useTabletRefresh,
	isLoading = false,
	primaryColor = '#FF6B00',
	lightMode = false,
}: VehicleFiltersProps) {
	const levels: Category[][] = [categories];
	let currentCategories = categories;
	for (const selectedId of selectedCategoryIds) {
		const selected = currentCategories.find((category) => category.id === selectedId);
		if (!selected || selected.children.length === 0) break;
		currentCategories = selected.children;
		levels.push(currentCategories);
	}

	const labelClassName = `${lightMode ? 'text-[#52525B]' : 'text-gray-400'} font-bold uppercase tracking-widest ml-2 ${
		useTabletRefresh ? 'text-[12px] mb-1' : 'text-sm mb-2'
	}`;
	const getFilterChipStyle = (active: boolean) =>
		useTabletRefresh
			? {
					height: 42,
					paddingHorizontal: 20,
					paddingVertical: 0,
					marginRight: 12,
					backgroundColor: active
						? lightMode
							? 'rgba(255, 107, 0, 0.12)'
							: 'rgba(255, 107, 0, 0.16)'
						: lightMode
							? '#FFFFFF'
							: '#242428',
					borderWidth: 1,
					borderColor: active
						? primaryColor
						: lightMode
							? '#D4D4D8'
							: 'rgba(255, 255, 255, 0.07)',
				}
			: {
					backgroundColor: active
						? lightMode
							? 'rgba(255, 107, 0, 0.12)'
							: primaryColor
						: lightMode
							? '#FFFFFF'
							: '#27272A',
					...(lightMode
						? { borderWidth: 1, borderColor: active ? primaryColor : '#D4D4D8' }
						: {}),
				};
	const chipClassName = `rounded-full justify-center items-center flex-row ${
		useTabletRefresh ? '' : 'px-6 py-3 mr-4 min-h-[48px]'
	}`;
	const optionTextClassName = (active: boolean) =>
		`text-sm font-bold ${
			lightMode
				? active
					? 'text-[#C65300]'
					: 'text-[#3F3F46]'
				: active
					? 'text-white'
					: 'text-gray-300'
		}`;

	if (isLoading) {
		return (
			<ActivityIndicator
				size='small'
				color={primaryColor}
				style={{ alignSelf: 'flex-start', marginVertical: 12, marginLeft: 8 }}
			/>
		);
	}

	return (
		<>
			{levels.map((levelCategories, level) => {
				const activeId = selectedCategoryIds[level];
				return (
					<View
						key={`category-level-${level}`}
						style={{
							marginBottom:
								level === levels.length - 1 ? 0 : useTabletRefresh ? 8 : 12,
						}}>
						<Text className={labelClassName}>{getLevelLabel(level)}</Text>
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerStyle={{ paddingRight: useTabletRefresh ? 12 : 16 }}>
							<TouchableOpacity
								onPress={() =>
									onCategoryPathChange(selectedCategoryIds.slice(0, level))
								}
								style={[
									getFilterChipStyle(activeId === undefined),
									{ flexShrink: 0 },
								]}
								className={chipClassName}>
								<Text
									className={optionTextClassName(activeId === undefined)}
									style={androidTextStyle as any}>
									{ALL_FILTER_LABEL}
								</Text>
							</TouchableOpacity>
							{levelCategories.map((category) => {
								const active = activeId === category.id;
								return (
									<TouchableOpacity
										key={category.id}
										onPress={() =>
											onCategoryPathChange([
												...selectedCategoryIds.slice(0, level),
												category.id,
											])
										}
										style={[getFilterChipStyle(active), { flexShrink: 0 }]}
										className={chipClassName}>
										<CategoryLogoOrText
											category={category}
											active={active}
											lightMode={lightMode}
										/>
									</TouchableOpacity>
								);
							})}
						</ScrollView>
					</View>
				);
			})}
		</>
	);
}
