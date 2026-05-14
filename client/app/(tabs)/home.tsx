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
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
};

/**
 * Mock data containing a list of available vehicles.
 */
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

// Predefined filter options for brands and vehicle types
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

// Dimensions mapping for logos used in filter buttons
const FILTER_LOGO_SIZES: Record<string, { width: number; height: number }> = {
    TOYOTA: { width: 96, height: 26 },
    DIECI: { width: 72, height: 26 },
    UNICARRIERS: { width: 132, height: 26 },
    TCM: { width: 60, height: 26 },
    STILL: { width: 60, height: 26 },
    JUNGHEINRICH: { width: 132, height: 26 },
    DEFAULT: { width: 84, height: 26 },
};

// Dimensions mapping for logos used inline within text
const INLINE_LOGO_SIZES: Record<string, { width: number; height: number }> = {
    TOYOTA: { width: 84, height: 24 },
    DIECI: { width: 60, height: 24 },
    UNICARRIERS: { width: 108, height: 24 },
    TCM: { width: 54, height: 24 },
    STILL: { width: 54, height: 24 },
    JUNGHEINRICH: { width: 108, height: 24 },
    DEFAULT: { width: 72, height: 24 },
};

/**
 * Returns the local image source for a given brand.
 * @param brand - The name of the brand.
 * @returns React Native image source or null if the brand is not found.
 */
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

/**
 * Renders an animated pulse background when the microphone is listening.
 */
const ListeningPulse = () => (
    <View className="absolute top-0 bottom-0 left-0 right-0 bg-[#FF6600]/20 rounded-[12px]" />
);

/**
 * Renders either the brand logo (if available) or the brand name as a text fallback.
 * Primarily used within the brand filter buttons.
 */
const BrandLogoOrText: React.FC<{ brand: string; active: boolean }> = ({ brand, active }) => {
    const [imageError, setImageError] = useState(false);
    const logoSource = getBrandLogo(brand);

    // Ensure proper text alignment on Android devices
    const textStyle =
        Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : {};

    // For the "ALL" ('WSZYSTKIE') filter, always render text
    if (brand === 'WSZYSTKIE') {
        return (
            <Text
                className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
                style={textStyle as any}>
                {brand}
            </Text>
        );
    }

    // Render image if the source is valid and there's no loading error
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

    // Fallback to text if the image fails to load
    return (
        <Text
            className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}
            style={textStyle as any}>
            {brand}
        </Text>
    );
};

/**
 * Renders a brand logo inline within a line of text.
 */
const InlineBrandAsset: React.FC<{ brand: string }> = ({ brand }) => {
    const [imageError, setImageError] = useState(false);
    const logoSource = getBrandLogo(brand);

    if (logoSource && !imageError) {
        const config = INLINE_LOGO_SIZES[brand.toUpperCase()] || INLINE_LOGO_SIZES.DEFAULT;

        return (
            <Image
                source={logoSource}
                style={{
                    width: config.width,
                    height: config.height,
                    marginHorizontal: 6,
                }}
                resizeMode='contain'
                onError={() => setImageError(true)}
            />
        );
    }

    // Fallback to stylized text if no logo is available
    return <Text className='text-white text-xl font-semibold mx-1'>{brand.toUpperCase()}</Text>;
};

// --- MAIN SCREEN ---

export default function HomeScreen() {
    const router = useRouter();

    // State for managing active filters and search queries
    const [activeBrandFilter, setActiveBrandFilter] = useState<string>('WSZYSTKIE');
    const [activeTypeFilter, setActiveTypeFilter] = useState<string>('WSZYSTKIE');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedImage, setSelectedImage] = useState<ImageSourcePropType | null>(null);

    // State for managing the voice assistant microphone
    const [isListening, setIsListening] = useState(false);

    const onMicPress = () => {
        setIsListening(!isListening);
    };

    // State and references for header scroll animations
    const [headerHeight, setHeaderHeight] = useState(0);
    const scrollY = useRef(new Animated.Value(0)).current;

    // Interpolations to hide the header on scroll down
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

    // Apply active filters and search query to the vehicles list
    const filteredVehicles = VEHICLES.filter((v) => {
        const mBrand = activeBrandFilter === 'WSZYSTKIE' || v.brand === activeBrandFilter;
        const mType = activeTypeFilter === 'WSZYSTKIE' || v.type.toUpperCase() === activeTypeFilter;
        const mSearch = v.name.toLowerCase().includes(searchQuery.toLowerCase());
        return mBrand && mType && mSearch;
    });

    /**
     * Parses the vehicle name and replaces recognized brand names with their corresponding logo images.
     */
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
            <View className='flex-row flex-wrap justify-center items-center mb-3 min-h-[32px]'>
                {elements.map((el, index) =>
                    typeof el === 'string' ? (
                        <Text key={index} className='text-white text-xl font-semibold'>
                            {el}
                        </Text>
                    ) : (
                        el
                    )
                )}
            </View>
        );
    };

    /**
     * Renders an individual item card in the vehicle list.
     */
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
                    onPress={() => router.push('/chat')}
                    style={{ backgroundColor: PRIMARY_ORANGE }}
                    className='w-full py-4 rounded-xl flex-row justify-center items-center'>
                    <Text className='text-white font-bold text-base'>WYBIERZ ➔</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView className='flex-1 bg-[#09090b]'>
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
                        paddingBottom: 16, // Dodano stały padding zamiast marginesów na dole elementów
                        zIndex: 10,
                        backgroundColor: '#09090b',
                    }}>
                    {/* Zmniejszono mb-8 na mb-4 */}
                    <View className='flex-row justify-between items-center mb-4'>
                        <View className='flex-row items-center'>
                            <Image
                                source={require('../../assets/images/fixo3.png')}
                                className='mr-3'
                                style={{ width: 80, height: 50 }}
                                resizeMode='contain'
                            />
                            <Text className='text-white text-4xl font-bold'>Wybierz Pojazd</Text>
                        </View>
                    </View>

                    {/* Zmniejszono mb-4 na mb-3 */}
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

                    {/* Usunięto mb-6 (zamieniono na mb-0), aby usunąć ogromną lukę pod filtrami */}
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

                <Animated.FlatList
                    data={filteredVehicles}
                    keyExtractor={(item) => item.id}
                    renderItem={renderVehicleCard}
                    numColumns={3}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingTop: headerHeight, // Teraz headerHeight będzie miał idealną wartość
                        paddingBottom: 180,
                        alignItems: 'center',
                    }}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                        useNativeDriver: true,
                    })}
                    scrollEventThrottle={16}
                />
            </View>

            <View
                style={{ pointerEvents: 'box-none' }}
                className='absolute bottom-8 left-0 right-0 w-full items-center z-50'
            >
                <BlurView
                    intensity={70} // Siła rozmycia (możesz dostosować, np. od 20 do 80)
                    tint="dark"    // Ciemny motyw szkła
                    className='flex-row items-start justify-center gap-6 px-10 py-6 overflow-hidden'
                    style={{
                        borderRadius: 100,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.25)',
                    }}
                    
                >
                    {/* Przycisk Aparatu */}
                    <TouchableOpacity className='w-[72px] h-[72px] bg-[#27272a] border border-[#3f3f46] rounded-[12px] items-center justify-center mt-[20px]'>
                        <Image
                            source={require('../../assets/images/camera.png')}
                            style={{ width: 32, height: 32, tintColor: '#D4D4D8' }}
                        />
                    </TouchableOpacity>

                    {/* Sekcja Mikrofonu */}
                    <View className='items-center flex-col gap-3 min-w-[140px]'>
                        <TouchableOpacity
                            onPressIn={onMicPress}
                            className={`w-[112px] h-[112px] rounded-[12px] items-center justify-center ${isListening
                                ? 'bg-[#2A1100] border-2 border-[#FF6600]'
                                : 'bg-[#27272a] border border-[#3f3f46]'
                                }`}
                        >
                            {isListening && <ListeningPulse />}
                            <Image
                                source={require('../../assets/images/micro.png')}
                                style={{ width: 56, height: 56, tintColor: isListening ? '#FF6600' : '#D4D4D8' }}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>
                        <Text
                            className={`text-center text-[11px] font-bold tracking-widest ${isListening ? 'text-[#FF6600]' : 'text-white'}`}
                            style={{
                                // Cień tekstu ratuje czytelność na skomplikowanych tłach
                                textShadowColor: 'rgba(0, 0, 0, 0.8)',
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 3
                            }}
                        >
                            {isListening ? 'SŁUCHAM...' : 'NACIŚNIJ ŻEBY MÓWIĆ'}
                        </Text>
                    </View>

                    {/* Przycisk Szukaj */}
                    <TouchableOpacity className='w-[72px] h-[72px] bg-[#27272a] border border-[#3f3f46] rounded-[12px] items-center justify-center mt-[20px]'>
                        <Image
                            source={require('../../assets/images/search.png')}
                            style={{ width: 32, height: 32, tintColor: '#D4D4D8' }}
                        />
                    </TouchableOpacity>
                </BlurView>
            </View>
        </SafeAreaView>
    );
}
