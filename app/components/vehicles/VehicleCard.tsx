import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, Text, TouchableOpacity, View } from 'react-native';

import ThemeAwareLogo from '@/components/ui/ThemeAwareLogo';
import { FILTER_LOGO_SIZES } from '@/components/vehicles/VehicleFilters';

export type Vehicle = {
	id: string;
	name: string;
	brand: string;
	type: string;
	imageUrl?: ImageSourcePropType;
	imageOffsetY: number;
	imageZoom: number;
};

type VehicleCardProps = {
	vehicle: Vehicle;
	cardWidth: number;
	cardHeight: number;
	imageHeight: number;
	imageZoom: number;
	isWeb: boolean;
	useCompactLayout: boolean;
	onOpen: (vehicle: Vehicle) => void;
	getBrandLogoUrl: (brandName: string) => string | null;
	lightMode?: boolean;
};

export default function VehicleCard({
	vehicle,
	cardWidth,
	cardHeight,
	imageHeight,
	imageZoom,
	isWeb,
	useCompactLayout,
	onOpen,
	getBrandLogoUrl,
	lightMode = false,
}: VehicleCardProps) {
	const [imageLoadFailed, setImageLoadFailed] = useState(false);
	const imageSourceKey = JSON.stringify(vehicle.imageUrl);

	useEffect(() => {
		setImageLoadFailed(false);
	}, [imageSourceKey, vehicle.id]);

	const logoUrl = getBrandLogoUrl(vehicle.brand);
	const logoHeight = useCompactLayout ? 22 : isWeb ? 24 : 20;
	const logoDims = FILTER_LOGO_SIZES[vehicle.brand.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;
	const brandToRemove = vehicle.brand.toLowerCase() + ' ';
	const cleanName = vehicle.name.toLowerCase().startsWith(brandToRemove)
		? vehicle.name.substring(brandToRemove.length)
		: vehicle.name;

	const renderCardInfo = () => {
		if (isWeb) {
			return (
				<View
					className='w-full flex-row items-center justify-center px-2'
					style={{ marginBottom: useCompactLayout ? 10 : 16 }}>
					{logoUrl && (
						<View
							style={{
								marginRight: 12,
							}}>
							<ThemeAwareLogo
								source={{ uri: logoUrl }}
								width={logoDims.width}
								height={logoHeight}
								lightMode={lightMode}
								resizeMode='contain'
							/>
						</View>
					)}
					<Text
						className={`${lightMode ? 'text-[#18181B]' : 'text-white'} font-bold ${useCompactLayout ? 'text-lg' : 'text-xl'}`}
						numberOfLines={1}>
						{cleanName.toUpperCase()}
					</Text>
				</View>
			);
		}

		return (
			<View
				className='w-full items-center justify-center'
				style={{ paddingHorizontal: useCompactLayout ? 10 : 12, paddingVertical: 6 }}>
				{logoUrl && (
					<View
						style={{
							alignSelf: 'center',
							marginBottom: 5,
						}}>
						<ThemeAwareLogo
							source={{ uri: logoUrl }}
							width={logoDims.width}
							height={logoHeight}
							lightMode={lightMode}
							resizeMode='contain'
						/>
					</View>
				)}
				<Text
					className={`${lightMode ? 'text-[#18181B]' : 'text-white'} font-bold text-center text-lg`}
					numberOfLines={3}
					style={{
						lineHeight: 22,
						maxWidth: '100%',
					}}>
					{cleanName.toUpperCase()}
				</Text>
			</View>
		);
	};

	return (
		<TouchableOpacity
			activeOpacity={isWeb ? 1 : 0.9}
			onPress={isWeb ? undefined : () => onOpen(vehicle)}
			className={`${lightMode ? 'bg-white border border-[#E4E4E7]' : 'bg-[#18181b]'} overflow-hidden flex-col`}
			style={
				{
					width: cardWidth,
					minHeight: cardHeight,
					margin: useCompactLayout ? 6 : 8,
					borderRadius: useCompactLayout ? 16 : 24,
					...(isWeb ? { cursor: 'default' } : {}),
				} as any
			}>
			<View
				className={`w-full items-center justify-center ${lightMode ? 'bg-[#F4F4F5]' : 'bg-[#27272a]'} overflow-hidden`}
				style={{ height: imageHeight, position: 'relative' }}>
				{vehicle.imageUrl && !imageLoadFailed ? (
					<Image
						source={vehicle.imageUrl}
						onError={() => setImageLoadFailed(true)}
						style={{
							position: 'absolute',
							width: '100%',
							height: '100%',
							transform: [
								{ scale: imageZoom * vehicle.imageZoom },
								{ translateY: vehicle.imageOffsetY },
							],
						}}
						resizeMode='cover'
					/>
				) : (
					<View
						className='items-center justify-center'
						accessibilityLabel='Brak zdjęcia pojazdu'>
						<MaterialCommunityIcons
							name='forklift'
							size={useCompactLayout ? 60 : isWeb ? 68 : 52}
							color={lightMode ? '#71717A' : '#A1A1AA'}
						/>
						<Text
							className={`${lightMode ? 'text-[#52525B]' : 'text-[#D4D4D8]'} mt-2 text-[13px] font-semibold uppercase tracking-wide`}>
							Brak zdjęcia
						</Text>
					</View>
				)}
			</View>

			<View
				className={`${lightMode ? 'bg-white border-[#E4E4E7]' : 'bg-[#18181b] border-[#3f3f46]'} flex-1 border-t justify-center items-center`}
				style={{
					paddingHorizontal: useCompactLayout ? 12 : 16,
					paddingVertical: useCompactLayout ? 8 : 10,
				}}>
				{renderCardInfo()}

				{isWeb && (
					<TouchableOpacity
						onPress={() => onOpen(vehicle)}
						className='w-full rounded-[14px] flex-row justify-center items-center mt-1 z-10'
						style={{
							backgroundColor: '#FF6B00',
							paddingVertical: useCompactLayout ? 12 : 16,
						}}>
						<Text className='text-white font-bold text-[15px]'>WYBIERZ</Text>
					</TouchableOpacity>
				)}
			</View>
		</TouchableOpacity>
	);
}
