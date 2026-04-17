import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
	Animated,
	Dimensions,
	Image,
	ImageSourcePropType,
	Modal,
	Platform,
	Pressable,
	SafeAreaView,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// --- KONFIGURACJA I DANE ---

type Vehicle = {
	id: string;
	name: string;
	brand: string;
	type: string;
	imageUrl: ImageSourcePropType;
};

const VEHICLES: Vehicle[] = [
	{
		id: '1',
		name: 'DIECI Pegasus Classic 60.25',
		brand: 'DIECI',
		type: 'czołowy',
		imageUrl: require('../../assets/images/WOZEK1.jpeg'),
	},
	{
		id: '2',
		name: 'UniCarriers ZX100',
		brand: 'UNICARRIERS',
		type: 'paletowy',
		imageUrl: require('../../assets/images/WOZEK2.jpg'),
	},
	{
		id: '3',
		name: 'TCM FGE25E2',
		brand: 'TCM',
		type: 'czołowy',
		imageUrl: require('../../assets/images/WOZEK3.jpg'),
	},
	{
		id: '4',
		name: 'Toyota 02-8FGFF15',
		brand: 'TOYOTA',
		type: 'paletowy z masztem',
		imageUrl: require('../../assets/images/WOZEK4.jpg'),
	},
	{
		id: '5',
		name: 'DIECI Icarus 60.18 – GD',
		brand: 'DIECI',
		type: 'czołowy',
		imageUrl: require('../../assets/images/WOZEK5.jpg'),
	},
	{
		id: '6',
		name: 'Jungheinrich TFG 425',
		brand: 'JUNGHEINRICH',
		type: 'czołowy',
		imageUrl: require('../../assets/images/WOZEK6.jpg'),
	},
];

const BRAND_FILTERS = [
	'WSZYSTKIE',
	'TOYOTA',
	'DIECI',
	'UNICARRIERS',
	'TCM',
	'STILL',
	'JUNGHEINRICH',
];
const TYPE_FILTERS = ['WSZYSTKIE', 'PALETOWY', 'PALETOWY Z MASZTEM', 'CZOŁOWY'];

const PRIMARY_BLUE = '#215A92';
const ACCENT_COLOR = '#3B82F6';

const FILTER_LOGO_SIZES: Record<string, { width: number; height: number }> = {
	TOYOTA: { width: 96, height: 26 },
	DIECI: { width: 72, height: 26 },
	UNICARRIERS: { width: 132, height: 26 },
	TCM: { width: 60, height: 26 },
	STILL: { width: 60, height: 26 },
	JUNGHEINRICH: { width: 132, height: 26 },
	DEFAULT: { width: 84, height: 26 },
};

const INLINE_LOGO_SIZES: Record<
	string,
	{ width: number; height: number; offsetWeb: number; offsetNative: number }
> = {
	TOYOTA: { width: 84, height: 24, offsetWeb: 4, offsetNative: 5 },
	DIECI: { width: 60, height: 24, offsetWeb: 4, offsetNative: 5 },
	UNICARRIERS: { width: 108, height: 24, offsetWeb: 5, offsetNative: 6 },
	TCM: { width: 54, height: 24, offsetWeb: 4, offsetNative: 5 },
	STILL: { width: 54, height: 24, offsetWeb: 4, offsetNative: 5 },
	JUNGHEINRICH: { width: 108, height: 24, offsetWeb: 5, offsetNative: 6 },
	DEFAULT: { width: 72, height: 24, offsetWeb: 4, offsetNative: 5 },
};

const getBrandLogo = (brand: string): ImageSourcePropType | null => {
	switch (brand.toUpperCase()) {
		case 'TOYOTA':
			return require('../../assets/images/toyota.png');
		case 'DIECI':
			return require('../../assets/images/dieci.png');
		case 'UNICARRIERS':
			return require('../../assets/images/unicarriers.png');
		case 'TCM':
			return require('../../assets/images/tcm.png');
		case 'STILL':
			return require('../../assets/images/still.png');
		case 'JUNGHEINRICH':
			return require('../../assets/images/jungheinrich.png');
		default:
			return null;
	}
};

// --- KOMPONENTY POMOCNICZE ---

const BrandLogoOrText: React.FC<{ brand: string; active: boolean }> = ({ brand, active }) => {
	const [imageError, setImageError] = useState(false);
	const logoSource = getBrandLogo(brand);

	const textStyle =
		Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {};

	if (brand === 'WSZYSTKIE') {
		return (
			<Text
				className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
				style={textStyle as any}>
				{brand}
			</Text>
		);
	}

	if (logoSource && !imageError) {
		const dims = FILTER_LOGO_SIZES[brand.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;
		return (
			<Image
				source={logoSource}
				style={{ width: dims.width, height: dims.height }}
				resizeMode='contain'
				onError={() => setImageError(true)}
			/>
		);
	}

	return (
		<Text
			className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
			style={textStyle as any}>
			{brand}
		</Text>
	);
};

const InlineBrandAsset: React.FC<{ brand: string }> = ({ brand }) => {
	const [imageError, setImageError] = useState(false);
	const logoSource = getBrandLogo(brand);

	if (logoSource && !imageError) {
		const config = INLINE_LOGO_SIZES[brand.toUpperCase()] || INLINE_LOGO_SIZES.DEFAULT;
		const verticalOffset = Platform.OS === 'web' ? config.offsetWeb : config.offsetNative;

		return (
			<Image
				source={logoSource}
				style={{
					width: config.width,
					height: config.height,
					transform: [{ translateY: verticalOffset }],
					marginHorizontal: 6,
				}}
				resizeMode='contain'
				onError={() => setImageError(true)}
			/>
		);
	}
	return <Text>{brand.toUpperCase()}</Text>;
};

// --- GŁÓWNY EKRAN ---

export default function SelectVehicleScreen() {
	const router = useRouter();
	const [activeBrandFilter, setActiveBrandFilter] = useState<string>('WSZYSTKIE');
	const [activeTypeFilter, setActiveTypeFilter] = useState<string>('WSZYSTKIE');
	const [searchQuery, setSearchQuery] = useState<string>('');
	const [selectedImage, setSelectedImage] = useState<ImageSourcePropType | null>(null);

	// Dynamiczna wysokość nagłówka
	const [headerHeight, setHeaderHeight] = useState(0);

	// Animacje
	const scrollY = useRef(new Animated.Value(0)).current;

	// --- POPRAWKI ANIMACJI ---
	// Zamiast sztywnego zakresu (np. `100`), używamy dynamicznego `headerHeight`.
	// Nagłówek zacznie znikać w tym samym momencie i z tą samą prędkością,
	// co lista wjeżdżająca pod niego. To zapobiega nagłemu przeskokowi i czarnemu ekranowi.

	const headerTranslateY = scrollY.interpolate({
		inputRange: [0, headerHeight || 1], // Unikamy dzielenia przez 0 przed zmierzeniem
		outputRange: [0, -(headerHeight || 1)], // Chowa panel dokładnie o jego wysokość
		extrapolate: 'clamp',
	});

	const headerOpacity = scrollY.interpolate({
		inputRange: [0, headerHeight || 1], // Synchronizacja ze znikaniem
		outputRange: [1, 0],
		extrapolate: 'clamp',
	});

	const filteredVehicles = VEHICLES.filter((v) => {
		const mBrand = activeBrandFilter === 'WSZYSTKIE' || v.brand === activeBrandFilter;
		const mType = activeTypeFilter === 'WSZYSTKIE' || v.type.toUpperCase() === activeTypeFilter;
		const mSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
		return mBrand && mType && mSearch;
	});

	const renderVehicleName = (name: string) => {
		let elements: (string | React.ReactNode)[] = [name];
		BRAND_FILTERS.filter((b) => b !== 'WSZYSTKIE').forEach((brand) => {
			const next: (string | React.ReactNode)[] = [];
			const regex = new RegExp(`(${brand})`, 'gi');
			elements.forEach((el) => {
				if (typeof el === 'string') {
					el.split(regex).forEach((part) => {
						if (part.toUpperCase() === brand.toUpperCase()) {
							next.push(<InlineBrandAsset key={Math.random()} brand={brand} />);
						} else if (part) next.push(part);
					});
				} else next.push(el);
			});
			elements = next;
		});
		return (
			<Text className='text-white text-xl font-semibold text-center mb-6' numberOfLines={1}>
				{elements}
			</Text>
		);
	};

	const renderVehicleCard = ({ item }: { item: Vehicle }) => (
		<View
			className='bg-[#18181b] rounded-2xl p-6 m-4 justify-between'
			style={{ width: 400, height: 400 }}>
			<TouchableOpacity
				activeOpacity={0.8}
				onPress={() => setSelectedImage(item.imageUrl)}
				className='flex-1 justify-center items-center w-full overflow-hidden rounded-2xl'>
				<Image
					source={item.imageUrl}
					className='w-full h-full max-h-48'
					resizeMode='contain'
					style={{ transform: [{ scale: 1.6 }] }}
				/>
			</TouchableOpacity>
			<View className='w-full mt-4'>
				{renderVehicleName(item.name)}
				<TouchableOpacity
					onPress={() => router.push('/inside')}
					style={{ backgroundColor: PRIMARY_BLUE }}
					className='w-full py-4 rounded-xl flex-row justify-center items-center'>
					<Text className='text-white font-bold text-base'>WYBIERZ ➔</Text>
				</TouchableOpacity>
			</View>
		</View>
	);

	return (
		<SafeAreaView className='flex-1 bg-[#09090b]'>
			{/* PODGLĄD MODALNY */}
			<Modal
				visible={!!selectedImage}
				transparent
				animationType='fade'
				onRequestClose={() => setSelectedImage(null)}>
				<Pressable
					className='flex-1 justify-center items-center bg-black/90'
					onPress={() => setSelectedImage(null)}>
					{selectedImage && (
						<View className='w-full items-center justify-center'>
							<Image
								source={selectedImage}
								style={{ width: '90%', height: SCREEN_HEIGHT * 0.9 }}
								resizeMode='contain'
							/>
							<TouchableOpacity
								onPress={() => setSelectedImage(null)}
								className='absolute top-10 right-10 p-2 bg-white/10 rounded-full'>
								<Ionicons name='close' size={32} color='white' />
							</TouchableOpacity>
						</View>
					)}
				</Pressable>
			</Modal>

			<View className='flex-1'>
				{/* 1. PANEL GÓRNY (ABSOLUTNY)
                Musi mieć tło, żeby lista pod nim znikała, a nie prześwitywała.
                DODANO `onLayout` do zmierzenia dokładnej wysokości.
             */}
				<Animated.View
					onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
					style={{
						opacity: headerOpacity,
						transform: [{ translateY: headerTranslateY }],
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						paddingHorizontal: 24,
						paddingTop: 16,
						zIndex: 10,
						backgroundColor: '#09090b',
					}}>
					<View className='flex-row justify-between items-center mb-8'>
						<View className='flex-row items-center'>
							<Image
								source={require('../../assets/images/LOGO.png')}
								className='mr-3'
								style={{ width: 50, height: 50 }}
								resizeMode='contain'
							/>
							<Text className='text-white text-4xl font-bold'>Wybierz Pojazd</Text>
						</View>

					</View>

					{/* Filtry Marek */}
					<View className='mb-4'>
						<Text className='text-gray-400 text-sm font-bold uppercase tracking-widest ml-2 mb-2'>
							Marka
						</Text>
						<ScrollView horizontal showsHorizontalScrollIndicator={false}>
							{BRAND_FILTERS.map((f) => (
								<TouchableOpacity
									key={f}
									onPress={() => setActiveBrandFilter(f)}
									style={{
										backgroundColor:
											activeBrandFilter === f ? PRIMARY_BLUE : '#27272a',
									}}
									className='px-6 py-3 rounded-full mr-4 min-h-[48px] justify-center items-center flex-row'>
									<BrandLogoOrText brand={f} active={activeBrandFilter === f} />
								</TouchableOpacity>
							))}
						</ScrollView>
					</View>

					{/* Filtry Typu */}
					<View className='mb-6'>
						<Text className='text-gray-400 text-sm font-bold uppercase tracking-widest ml-2 mb-2'>
							Typ
						</Text>
						<ScrollView horizontal showsHorizontalScrollIndicator={false}>
							{TYPE_FILTERS.map((f) => (
								<TouchableOpacity
									key={f}
									onPress={() => setActiveTypeFilter(f)}
									style={{
										backgroundColor:
											activeTypeFilter === f ? PRIMARY_BLUE : '#27272a',
									}}
									className='px-6 py-3 rounded-full mr-4 min-h-[48px] justify-center items-center flex-row'>
									<Text
										className={`text-sm font-bold ${activeTypeFilter === f ? 'text-white' : 'text-gray-300'}`}
										style={
											Platform.OS === 'android'
												? {
														includeFontPadding: false,
														textAlignVertical: 'center',
													}
												: {}
										}>
										{f}
									</Text>
								</TouchableOpacity>
							))}
						</ScrollView>
					</View>
				</Animated.View>

				{/* 2. LISTA WÓZKÓW
                POPRAWKA: Dynamiczny `paddingTop` używa zmierzonej wysokości nagłówka.
                Dzięki temu lista zaczyna się idealnie pod filtrami, bez pustej przerwy.
             */}
				<Animated.FlatList
					data={filteredVehicles}
					keyExtractor={(item) => item.id}
					renderItem={renderVehicleCard}
					numColumns={3}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{
						paddingTop: headerHeight, // Dynamiczny padding równy wysokości nagłówka
						paddingBottom: 200,
						alignItems: 'center',
					}}
					onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
						useNativeDriver: true,
					})}
					scrollEventThrottle={16}
				/>
			</View>

			{/* ASYSTENT GŁOSOWY - POPRAWIONE CIENIE I TEKST */}
			<View
				pointerEvents='box-none'
				className='absolute bottom-12 left-0 right-0 items-center justify-end z-50 px-6'>
				{/* Główny kontener - "Glassmorphism" stabilny na tablecie */}
				<View
					style={{
						// Tło ciemne, lekko przezroczyste (odpowiednik szkła w Figmie)
						backgroundColor: 'rgba(23, 23, 23, 0.95)',
						borderRadius: 56,
						paddingVertical: 28,
						paddingHorizontal: 32,
						minWidth: 360,
						// Drop shadow (Cień spodu kontenera)
						shadowColor: '#000',
						shadowOffset: { width: 0, height: 32 },
						shadowOpacity: 0.7,
						shadowRadius: 64,
						elevation: 24, // Android shadow
						// Imitacja Inner Shadow (ramka)
						borderWidth: 1,
						borderColor: 'rgba(255, 255, 255, 0.05)',
					}}>
					{/* Grupa przycisków wewnątrz kontenera */}
					<View className='flex-row items-center justify-center mb-6' style={{ gap: 32 }}>
						{/* Lewy: Aparat */}
						<TouchableOpacity
							activeOpacity={0.7}
							className='w-20 h-20 rounded-2xl items-center justify-center'
							style={{
								backgroundColor: 'rgba(255, 255, 255, 0.05)',
								borderColor: 'rgba(255, 255, 255, 0.1)',
								borderWidth: 1,
							}}>
							<Image
								source={require('../../assets/images/camera.png')}
								style={{ width: 32, height: 32, tintColor: 'white' }}
								resizeMode='contain'
							/>
						</TouchableOpacity>

						{/* Środkowy: Mikrofon z poświatą (Glow) */}
						<View className='relative items-center justify-center w-28 h-28'>
							{/* Glow za mikrofonem */}
							<View
								className='absolute w-[100px] h-[100px] rounded-[32px]'
								style={{
									backgroundColor: 'rgba(59, 130, 246, 0.25)', // Jaśniejsza niebieska poświata
									shadowColor: '#3B82F6',
									shadowOffset: { width: 0, height: 0 },
									shadowOpacity: 1,
									shadowRadius: 24,
									elevation: 10,
								}}
							/>
							<TouchableOpacity
								activeOpacity={0.8}
								className='absolute w-28 h-28 rounded-3xl border-2 items-center justify-center z-10'
								style={{
									backgroundColor: '#171717', // Pełny kolor tła przycisku
									borderColor: '#3B82F6', // Niebieska obwódka
								}}>
								<Ionicons
									name='mic'
									size={54}
									color='#3B82F6'
									style={{
										textShadowColor: 'rgba(59, 130, 246, 0.8)',
										textShadowRadius: 15,
									}}
								/>
							</TouchableOpacity>
						</View>

						{/* Prawy: Szukaj */}
						<TouchableOpacity
							activeOpacity={0.7}
							className='w-20 h-20 rounded-2xl items-center justify-center'
							style={{
								backgroundColor: 'rgba(255, 255, 255, 0.05)',
								borderColor: 'rgba(255, 255, 255, 0.1)',
								borderWidth: 1,
							}}>
							<Image
								source={require('../../assets/images/search.png')}
								style={{ width: 32, height: 32, tintColor: 'white' }}
								resizeMode='contain'
							/>
						</TouchableOpacity>
					</View>

					{/* Tekst pod przyciskami */}
					<View className='items-center'>
						<Text
							className='font-black text-2xl uppercase tracking-[4px]'
							style={{
								color: '#3B82F6', // Niebieski tekst
								textShadowColor: 'rgba(0, 0, 0, 0.8)',
								textShadowOffset: { width: 0, height: 2 },
								textShadowRadius: 4,
							}}>
							ASYSTENT SŁUCHA
						</Text>
						{/* Podpis z obrazka z instrukcją dla użytkownika */}

					</View>
				</View>
			</View>
		</SafeAreaView>
	);
}
