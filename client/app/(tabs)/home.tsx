import React, { useState } from 'react';
import {
    View,
    Text,
    Image,
    FlatList,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    TextInput,
    ImageSourcePropType,
    Modal,           // Dodano
    Dimensions,      // Dodano
    Pressable        // Dodano dla lepszej obsługi zamykania
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// --- TYPY ---
type Vehicle = {
    id: string;
    name: string;
    brand: string;
    type: string;
    imageUrl: ImageSourcePropType;
};

// ... (Dane MOCKOWE i KONFIGURACJA pozostają bez zmian) ...
const VEHICLES: Vehicle[] = [
    { id: '1', name: 'DIECI Pegasus Classic 60.25', brand: 'DIECI', type: 'czołowy', imageUrl: require('../../assets/images/WOZEK1.jpeg') },
    { id: '2', name: 'UniCarriers ZX100', brand: 'UNICARRIERS', type: 'paletowy', imageUrl: require('../../assets/images/WOZEK2.jpg') },
    { id: '3', name: 'TCM FGE25E2', brand: 'TCM', type: 'czołowy', imageUrl: require('../../assets/images/WOZEK3.jpg') },
    { id: '4', name: 'Toyota 02-8FGFF15', brand: 'TOYOTA', type: 'paletowy z masztem', imageUrl: require('../../assets/images/WOZEK4.jpg') },
    { id: '5', name: 'DIECI Icarus 60.18 – GD', brand: 'DIECI', type: 'czołowy', imageUrl: require('../../assets/images/WOZEK5.jpg') },
    { id: '6', name: 'Jungheinrich TFG 425', brand: 'JUNGHEINRICH', type: 'czołowy', imageUrl: require('../../assets/images/WOZEK6.jpg') },
];

const BRAND_FILTERS = ['WSZYSTKIE', 'TOYOTA', 'DIECI', 'UNICARRIERS', 'TCM', 'STILL', 'JUNGHEINRICH'];
const TYPE_FILTERS = ['WSZYSTKIE', 'PALETOWY', 'PALETOWY Z MASZTEM', 'CZOŁOWY'];
const PRIMARY_BLUE = '#215A92';

const FILTER_LOGO_SIZES: Record<string, { width: number, height: number }> = {
    'TOYOTA': { width: 96, height: 26 },
    'DIECI': { width: 72, height: 26 },
    'UNICARRIERS': { width: 132, height: 26 },
    'TCM': { width: 60, height: 26 },
    'STILL': { width: 60, height: 26 },
    'JUNGHEINRICH': { width: 132, height: 26 },
    'DEFAULT': { width: 84, height: 26 }
};

const INLINE_LOGO_SIZES: Record<string, { width: number, height: number, top: number }> = {
    'TOYOTA': { width: 84, height: 24, top: 4 },
    'DIECI': { width: 60, height: 24, top: 4 },
    'UNICARRIERS': { width: 108, height: 24, top: 5 },
    'TCM': { width: 54, height: 24, top: 4 },
    'STILL': { width: 54, height: 24, top: 4 },
    'JUNGHEINRICH': { width: 108, height: 24, top: 5 },
    'DEFAULT': { width: 72, height: 24, top: 4 }
};

const getBrandLogo = (brand: string): ImageSourcePropType | null => {
    switch (brand.toUpperCase()) {
        case 'TOYOTA': return require('../../assets/images/toyota.png');
        case 'DIECI': return require('../../assets/images/dieci.png');
        case 'UNICARRIERS': return require('../../assets/images/unicarriers.png');
        case 'TCM': return require('../../assets/images/tcm.png');
        case 'STILL': return require('../../assets/images/still.png');
        case 'JUNGHEINRICH': return require('../../assets/images/jungheinrich.png');
        default: return null;
    }
};

const BrandLogoOrText: React.FC<{ brand: string; active: boolean }> = ({ brand, active }) => {
    const [imageError, setImageError] = useState(false);
    const logoSource = getBrandLogo(brand);
    const textComponent = <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{brand}</Text>;
    if (brand === 'WSZYSTKIE') return textComponent;
    if (logoSource && !imageError) {
        const dimensions = FILTER_LOGO_SIZES[brand.toUpperCase()] || FILTER_LOGO_SIZES.DEFAULT;
        return <Image source={logoSource} style={{ width: dimensions.width, height: dimensions.height }} resizeMode="contain" onError={() => setImageError(true)} />;
    }
    return textComponent;
};

const InlineBrandAsset: React.FC<{ brand: string }> = ({ brand }) => {
    const [imageError, setImageError] = useState(false);
    const logoSource = getBrandLogo(brand);
    if (logoSource && !imageError) {
        const config = INLINE_LOGO_SIZES[brand.toUpperCase()] || INLINE_LOGO_SIZES.DEFAULT;
        return <Image source={logoSource} style={{ width: config.width, height: config.height, top: config.top, marginHorizontal: 6 }} resizeMode="contain" onError={() => setImageError(true)} />;
    }
    return <Text>{brand.toUpperCase()}</Text>;
};

export default function SelectVehicleScreen() {
    const router = useRouter();
    const [activeBrandFilter, setActiveBrandFilter] = useState<string>('WSZYSTKIE');
    const [activeTypeFilter, setActiveTypeFilter] = useState<string>('WSZYSTKIE');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // NOWY STAN: Dla powiększonego zdjęcia
    const [selectedImage, setSelectedImage] = useState<ImageSourcePropType | null>(null);

    const filteredVehicles = VEHICLES.filter((vehicle) => {
        const matchesBrand = activeBrandFilter === 'WSZYSTKIE' || vehicle.brand === activeBrandFilter;
        const matchesType = activeTypeFilter === 'WSZYSTKIE' || vehicle.type === activeTypeFilter;
        const matchesSearch = vehicle.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesBrand && matchesType && matchesSearch;
    });

    const renderVehicleName = (name: string) => {
        let currentTextElements: (string | React.ReactNode)[] = [name];
        BRAND_FILTERS.filter(b => b !== 'WSZYSTKIE').forEach(brand => {
            const newElements: (string | React.ReactNode)[] = [];
            const regex = new RegExp(`(${brand})`, 'gi');
            currentTextElements.forEach(element => {
                if (typeof element === 'string') {
                    const parts = element.split(regex);
                    parts.forEach(part => {
                        if (part.toUpperCase() === brand.toUpperCase()) {
                            newElements.push(<InlineBrandAsset key={`${brand}-${part}`} brand={brand} />);
                        } else if (part) {
                            newElements.push(part);
                        }
                    });
                } else {
                    newElements.push(element);
                }
            });
            currentTextElements = newElements;
        });
        return <Text className="text-white text-xl font-semibold text-center mb-6" numberOfLines={1}>{currentTextElements}</Text>;
    };

    const renderVehicleCard = ({ item }: { item: Vehicle }) => (
        <View className="bg-[#18181b] rounded-2xl p-6 m-4 justify-between" style={{ width: 400, height: 400 }}>
            {/* Zdjęcie teraz jest klikalne */}
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedImage(item.imageUrl)}
                className="flex-1 justify-center items-center w-full min-h-0 overflow-hidden rounded-2xl"
            >
                <Image
                    source={item.imageUrl}
                    className="w-full h-full max-h-48"
                    resizeMode="contain"
                    style={{ transform: [{ scale: 1.6 }] }}
                />
            </TouchableOpacity>

            <View className="w-full mt-4">
                {renderVehicleName(item.name)}
                <TouchableOpacity
                    onPress={() => router.push('/inside')}
                    style={{ backgroundColor: PRIMARY_BLUE }}
                    className="w-full py-4 rounded-xl flex-row justify-center items-center"
                >
                    <Text className="text-white font-bold text-base">WYBIERZ ➔</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView className="flex-1 bg-[#09090b]">
            <View className="flex-1 p-6">

                {/* --- MODAL POWIĘKSZENIA --- */}
                <Modal
                    visible={!!selectedImage}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setSelectedImage(null)}
                >
                    <Pressable
                        className="flex-1 justify-center items-center bg-black/90"
                        onPress={() => setSelectedImage(null)}
                    >
                        {selectedImage && (
                            <View className="w-full items-center justify-center">
                                <Image
                                    source={selectedImage}
                                    style={{
                                        width: '90%',
                                        height: SCREEN_HEIGHT * 0.9
                                    }}
                                    resizeMode="contain"
                                />
                                <TouchableOpacity
                                    onPress={() => setSelectedImage(null)}
                                    className="absolute top-10 right-10 p-2 bg-white/10 rounded-full"
                                >
                                    <Ionicons name="close" size={32} color="white" />
                                </TouchableOpacity>
                            </View>
                        )}
                    </Pressable>
                </Modal>

                {/* --- HEADER --- */}
                <View className="flex-row justify-between items-center mb-8 mt-4">
                    <View className="flex-row items-center">
                        <Image
                            source={require('../../assets/images/LOGO.png')}
                            className="mr-3"
                            style={{ width: 50, height: 50 }}
                            resizeMode="contain"
                        />
                        <Text className="text-white text-4xl font-bold">Wybierz Pojazd</Text>
                    </View>

                    {/* Zmieniony kontener wyszukiwarki - dodano guzik kamery po lewej */}
                    <View className="flex-row items-center">

                        {/* NOWY GUZIK KAMERY */}
                        <TouchableOpacity
                            onPress={() => console.log('Kamera kliknięta')}
                            className="bg-[#18181b] p-3 rounded-full mr-3 justify-center items-center"
                        >
                            <Image
                                source={require('../../assets/images/camera.png')}
                                style={{ width: 24, height: 24 }}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>

                        {/* Pasek wyszukiwania */}
                        <View className="flex-row items-center bg-[#18181b] px-4 py-3 rounded-full w-72">
                            <Ionicons name="search" size={20} color="#9ca3af" />
                            <TextInput
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Wyszukaj pojazd..."
                                placeholderTextColor="#9ca3af"
                                className="text-white ml-3 flex-1 text-base outline-none"
                            />
                        </View>
                    </View>
                </View>

                {/* --- FILTRY I LISTA (Kod skrócony dla czytelności) --- */}
                {/* ... (Filtry Marka i Typ bez zmian) ... */}
                <View className="mb-4">
                    <Text className="text-gray-400 text-sm font-bold uppercase tracking-widest ml-2 mb-2">Marka</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {BRAND_FILTERS.map((filter) => (
                            <TouchableOpacity key={filter} onPress={() => setActiveBrandFilter(filter)} style={{ backgroundColor: activeBrandFilter === filter ? PRIMARY_BLUE : '#27272a' }} className="px-6 py-3 rounded-full mr-4 min-h-[48px]">
                                <BrandLogoOrText brand={filter} active={activeBrandFilter === filter} />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View className="mb-8">
                    <Text className="text-gray-400 text-sm font-bold uppercase tracking-widest ml-2 mb-2">Typ</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {TYPE_FILTERS.map((filter) => (
                            <TouchableOpacity key={filter} onPress={() => setActiveTypeFilter(filter)} style={{ backgroundColor: activeTypeFilter === filter ? PRIMARY_BLUE : '#27272a' }} className="px-6 py-3 rounded-full mr-4 min-h-[48px]">
                                <Text className={`text-sm font-bold ${activeTypeFilter === filter ? 'text-white' : 'text-gray-300'}`}>{filter}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <FlatList
                    data={filteredVehicles}
                    keyExtractor={(item) => item.id}
                    renderItem={renderVehicleCard}
                    numColumns={3}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }}
                />
            </View>
            {/* --- ABSOLUTNY OBSZAR ASYSTENTA GŁOSOWEGO --- */}
            <View
                pointerEvents="box-none"
                className="absolute bottom-0 left-0 right-0 items-center justify-end z-50"
            >
                {/* Tło kontenera (przyciemniane, zaokrąglone na górze) */}
                <View className="bg-[#09090b]/95 border-t border-white/10 w-[340px] pt-10 pb-12 rounded-t-[40px] items-center">

                    {/* Okrąg z mikrofonem i efektem "glow" */}
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => console.log('Nasłuchiwanie...')}
                        className="w-24 h-24 rounded-full border-[1.5px] items-center justify-center mb-6"
                        style={{
                            borderColor: PRIMARY_BLUE,
                            backgroundColor: 'rgba(33, 90, 146, 0.05)', // bardzo delikatne niebieskie tło
                            // Imitacja cienia/poświaty (glow) wokół przycisku
                            shadowColor: PRIMARY_BLUE,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.6,
                            shadowRadius: 20,
                            elevation: 15,
                        }}
                    >
                        <Ionicons name="mic" size={40} color={PRIMARY_BLUE} />
                    </TouchableOpacity>

                    {/* Teksty */}
                    <Text
                        className="text-lg font-bold tracking-[0.2em] mb-3"
                        style={{ color: PRIMARY_BLUE }}
                    >
                        ASYSTENT SŁUCHA
                    </Text>

                    <Text className="text-[11px] text-gray-400 font-bold tracking-widest text-center">
                        POWIEDZ NAZWĘ POJAZDU ABY GO WYSZUKAĆ
                    </Text>
                </View>
            </View>
        </SafeAreaView>
    );
}