import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    ImageSourcePropType,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// --- CONFIGURATION & DATA ---

/**
 * Represents a vehicle entity.
 */
type Vehicle = {
    id: string;
    name: string;
    brand: string;
    type: string;
    imageUrl: ImageSourcePropType;
    imageOffsetY: number;
    imageZoom: number;
};

const VEHICLES: Vehicle[] = [
    {
        id: '1',
        name: 'DIECI Pegasus Classic 60.25',
        brand: 'DIECI',
        type: 'czołowy',
        imageUrl: require('../../assets/images/WOZEK1.jpeg'),
        imageOffsetY: -20,
        imageZoom: 1.00,
    },
    {
        id: '2',
        name: 'UniCarriers ZX100',
        brand: 'UNICARRIERS',
        type: 'paletowy',
        imageUrl: require('../../assets/images/WOZEK2.jpg'),
        imageOffsetY: -20,
        imageZoom: 1.00,
    },
    {
        id: '3',
        name: 'TCM FGE25E2',
        brand: 'TCM',
        type: 'czołowy',
        imageUrl: require('../../assets/images/WOZEK3.jpg'),
        imageOffsetY: -40,
        imageZoom: 1.00,
    },
    {
        id: '4',
        name: 'Toyota 02-8FGFF15',
        brand: 'TOYOTA',
        type: 'paletowy z masztem',
        imageUrl: require('../../assets/images/WOZEK4.jpg'),
        imageOffsetY: 10,
        imageZoom: 1.00,
    },
    {
        id: '5',
        name: 'DIECI Icarus 60.18 - GD',
        brand: 'DIECI',
        type: 'czołowy',
        imageUrl: require('../../assets/images/WOZEK5.jpg'),
        imageOffsetY: 0,
        imageZoom: 1.0,
    },
    {
        id: '6',
        name: 'Jungheinrich TFG 425',
        brand: 'JUNGHEINRICH',
        type: 'czołowy',
        imageUrl: require('../../assets/images/WOZEK6.jpg'),
        imageOffsetY: -55,
        imageZoom: 1.20,
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

const PRIMARY_ORANGE = '#FF6B00';

const FILTER_LOGO_SIZES: Record<string, { width: number; height: number }> = {
	TOYOTA: { width: 96, height: 26 },
	DIECI: { width: 72, height: 26 },
	UNICARRIERS: { width: 132, height: 26 },
	TCM: { width: 60, height: 26 },
	STILL: { width: 60, height: 26 },
	JUNGHEINRICH: { width: 132, height: 26 },
	DEFAULT: { width: 84, height: 26 },
};

const INLINE_LOGO_SIZES: Record<string, { width: number; height: number }> = {
	TOYOTA: { width: 84, height: 24 },
	DIECI: { width: 60, height: 24 },
	UNICARRIERS: { width: 108, height: 24 },
	TCM: { width: 54, height: 24 },
	STILL: { width: 54, height: 24 },
	JUNGHEINRICH: { width: 108, height: 24 },
	DEFAULT: { width: 72, height: 24 },
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

// --- HELPER COMPONENTS ---

const ListeningPulse = () => (
	<View className='absolute top-0 bottom-0 left-0 right-0 bg-[#FF6600]/20 rounded-[12px]' />
);

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

// --- MAIN SCREEN ---

export default function HomeScreen() {
    const router = useRouter();
    const { width: CURRENT_SCREEN_WIDTH } = useWindowDimensions();
    const isTablet = CURRENT_SCREEN_WIDTH >= 768;
    const insets = useSafeAreaInsets();

    const [activeBrandFilter, setActiveBrandFilter] = useState<string>('WSZYSTKIE');
    const [activeTypeFilter, setActiveTypeFilter] = useState<string>('WSZYSTKIE');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [isListening, setIsListening] = useState(false);

    const onMicPress = () => {
        setIsListening(!isListening);
    };

    const [headerHeight, setHeaderHeight] = useState(0);
    const scrollY = useRef(new Animated.Value(0)).current;

    const headerTranslateY = scrollY.interpolate({
        inputRange: [0, headerHeight || 1],
        outputRange: [0, -(headerHeight || 1)],
        extrapolate: 'clamp',
    });

    const headerOpacity = scrollY.interpolate({
        inputRange: [0, headerHeight || 1],
        outputRange: [1, 0],
        extrapolate: 'clamp',
    });

    const filteredVehicles = VEHICLES.filter((v) => {
        const mBrand = activeBrandFilter === 'WSZYSTKIE' || v.brand === activeBrandFilter;
        const mType = activeTypeFilter === 'WSZYSTKIE' || v.type.toUpperCase() === activeTypeFilter;
        const mSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
        return mBrand && mType && mSearch;
    });

    const isWeb = Platform.OS === 'web';
    const paddingHorizontal = isTablet || isWeb ? 16 : 8;
    const containerPadding = paddingHorizontal * 2;
    const cardMargin = 16;

    let columns = 2;
    if (isWeb) {
        columns = Math.max(2, Math.floor((CURRENT_SCREEN_WIDTH - containerPadding) / 320));
    } else if (isTablet) {
        columns = 3;
    }

    const cardWidth = (CURRENT_SCREEN_WIDTH - containerPadding) / columns - cardMargin;
    const cardHeight = isWeb ? 380 : (isTablet ? 340 : cardWidth + 90);
    const imageHeight = isWeb || isTablet ? 240 : cardWidth;

    const renderCardInfo = (vehicle: Vehicle, isTabletSize: boolean) => {
        const logoSource = getBrandLogo(vehicle.brand);
        const logoHeight = isTabletSize || isWeb ? 24 : 20;

        const brandToRemove = vehicle.brand.toLowerCase() + ' ';
        const cleanName = vehicle.name.toLowerCase().startsWith(brandToRemove)
            ? vehicle.name.substring(brandToRemove.length)
            : vehicle.name;

        if (isWeb) {
            return (
                <View className='w-full flex-row items-center justify-center mb-4 px-2'>
                    {logoSource && (
                        <Image
                            source={logoSource}
                            style={{ height: logoHeight, width: 80, marginRight: 12 }}
                            resizeMode='contain'
                        />
                    )}
                    <Text
                        className='text-white font-bold text-xl'
                        numberOfLines={1}>
                        {cleanName.toUpperCase()}
                    </Text>
                </View>
            );
        }

        return (
            <View className='w-full items-center justify-center p-3'>
                {logoSource && (
                    <View style={{ width: '100%', height: logoHeight, marginBottom: 8 }}>
                        <Image
                            source={logoSource}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode='contain'
                        />
                    </View>
                )}
                <Text
                    className={`text-white font-bold text-center ${isTabletSize ? 'text-xl' : 'text-lg'}`}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    {cleanName.toUpperCase()}
                </Text>
            </View>
        );
    };

    const renderVehicleCard = ({ item }: { item: Vehicle }) => {
        return (
            <TouchableOpacity
                activeOpacity={isWeb ? 1 : 0.9}
                onPress={isWeb ? undefined : () => router.push('/chat')}
                className='bg-[#18181b] rounded-[24px] m-2 overflow-hidden flex-col'
                style={{ width: cardWidth, height: cardHeight, ...(isWeb ? { cursor: 'default' } : {}) } as any}>

                <View
                    className='w-full items-center justify-center bg-[#27272a] overflow-hidden'
                    style={{ height: imageHeight, position: 'relative' }}>
                    <Image
                        source={item.imageUrl}
                        style={{
                            position: 'absolute',
                            width: cardWidth,
                            height: imageHeight * 1.5,
                            top: -(imageHeight * 0.25),
                            transform: [
                                { scale: item.imageZoom },
                                { translateY: item.imageOffsetY }
                            ]
                        }}
                        resizeMode='cover'
                    />
                </View>

                <View className={`bg-[#18181b] flex-1 p-4 border-t border-[#3f3f46] justify-center items-center`}>
                    {renderCardInfo(item, isTablet)}

                    {isWeb && (
                        <TouchableOpacity
                            onPress={() => router.push('/chat')}
                            style={{ backgroundColor: PRIMARY_ORANGE }}
                            className='w-full py-4 rounded-[16px] flex-row justify-center items-center mt-1 z-10'>
                            <Text className='text-white font-bold text-[15px]'>WYBIERZ ➔</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const bottomBar = {
        gap: isTablet ? 12 : 8,
        paddingHorizontal: isTablet ? 24 : 16,
        sideBtnSize: isTablet ? 88 : 68,
        centerBtnSize: isTablet ? 112 : 88,
        sideIconSize: isTablet ? 40 : 32,
        centerIconSize: isTablet ? 56 : 40,
    };

    return (
        <SafeAreaView className='flex-1 bg-[#09090b]'>
            <View className='flex-1'>
                <Animated.View
                    onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
                    style={{
                        opacity: headerOpacity,
                        transform: [{ translateY: headerTranslateY }],
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        paddingHorizontal: isTablet ? 24 : 16,
                        paddingTop: 16,
                        paddingBottom: 16,
                        zIndex: 10,
                        backgroundColor: '#09090b',
                    }}>
                    <View className='flex-row justify-between items-center mb-4'>
                        <View className='flex-row items-center'>
                            <Image
                                source={require('../../assets/images/fixo3.png')}
                                className='mr-3'
                                style={{ width: isTablet ? 80 : 60, height: isTablet ? 50 : 38 }}
                                resizeMode='contain'
                            />
                            <Text
                                className={`${isTablet ? 'text-4xl' : 'text-2xl'
                                    } text-white font-bold`}>
                                Wybierz Pojazd
                            </Text>
                        </View>
                    </View>

                    <View className='mb-3'>
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
                                            activeBrandFilter === f ? PRIMARY_ORANGE : '#27272a',
                                    }}
                                    className='px-6 py-3 rounded-full mr-4 min-h-[48px] justify-center items-center flex-row'>
                                    <BrandLogoOrText brand={f} active={activeBrandFilter === f} />
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    <View className='mb-0'>
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
                                            activeTypeFilter === f ? PRIMARY_ORANGE : '#27272a',
                                    }}
                                    className='px-6 py-3 rounded-full mr-4 min-h-[48px] justify-center items-center flex-row'>
                                    <Text
                                        className={`text-sm font-bold ${activeTypeFilter === f ? 'text-white' : 'text-gray-300'
                                            }`}
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

                <Animated.FlatList
                    key={`grid-${columns}`}
                    data={filteredVehicles}
                    keyExtractor={(item) => item.id}
                    renderItem={renderVehicleCard}
                    numColumns={columns}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingTop: headerHeight,
                        paddingBottom: 220,
                        paddingHorizontal: paddingHorizontal,
                        alignItems: 'center',
                    }}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                        useNativeDriver: true,
                    })}
                    scrollEventThrottle={16}
                />
            </View>

            <View
                style={{
                    pointerEvents: 'box-none',
                    bottom: insets.bottom > 0 ? insets.bottom + 16 : 32
                }}
                className='absolute left-0 right-0 w-full items-center z-50'
            >
                <BlurView
                    intensity={Platform.OS === 'android' ? 10 : 30}
                    tint="dark"
                    className='flex-row items-center justify-center overflow-hidden'
                    style={{
                        borderRadius: 100,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.25)',
                        paddingHorizontal: isTablet ? 24 : 16,
                        paddingVertical: isTablet ? 16 : 12,
                        gap: isTablet ? 12 : 8,
                        backgroundColor: Platform.OS === 'android' ? 'rgba(39, 39, 42, 0.55)' : 'transparent',
                    }}
                >
                    <TouchableOpacity
                        className='bg-[#27272a] border border-[#3f3f46] rounded-[12px] items-center justify-center'
                        style={{ width: bottomBar.sideBtnSize, height: bottomBar.sideBtnSize }}
                    >
                        <Image
                            source={require('../../assets/images/camera.png')}
                            style={{ width: bottomBar.sideIconSize, height: bottomBar.sideIconSize, tintColor: '#D4D4D8' }}
                        />
                    </TouchableOpacity>

                    <View className='items-center flex-col gap-2' style={{ width: isTablet ? 140 : 120 }}>
                        <TouchableOpacity
                            onPressIn={onMicPress}
                            className={`rounded-[12px] items-center justify-center ${isListening
                                ? 'bg-[#2A1100] border-2 border-[#FF6600]'
                                : 'bg-[#27272a] border border-[#3f3f46]'
                                }`}
                            style={{ width: bottomBar.centerBtnSize, height: bottomBar.centerBtnSize }}
                        >
                            {isListening && <ListeningPulse />}
                            <Image
                                source={require('../../assets/images/micro.png')}
                                style={{ width: bottomBar.centerIconSize, height: bottomBar.centerIconSize, tintColor: isListening ? '#FF6600' : '#D4D4D8' }}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>
                        <Text
                            className={`text-center text-[10px] sm:text-[11px] font-bold tracking-widest ${isListening ? 'text-[#FF6600]' : 'text-white'}`}
                            style={{
                                textShadowColor: 'rgba(0, 0, 0, 0.8)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 3
                            }}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {isListening ? 'SŁUCHAM...' : 'NACIŚNIJ ŻEBY MÓWIĆ'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        className='bg-[#27272a] border border-[#3f3f46] rounded-[12px] items-center justify-center'
                        style={{ width: bottomBar.sideBtnSize, height: bottomBar.sideBtnSize }}
                    >
                        <Image
                            source={require('../../assets/images/search.png')}
                            style={{ width: bottomBar.sideIconSize, height: bottomBar.sideIconSize, tintColor: '#D4D4D8' }}
                        />
                    </TouchableOpacity>
                </BlurView>
            </View>
        </SafeAreaView>
    );
}
