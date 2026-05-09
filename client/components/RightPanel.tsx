import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import PdfViewer from './PdfViewer';

const AVAILABLE_FILES = [
    { id: 1, name: 'Instrukcja_Obslugi_Toyota.pdf', icon: 'forklift', color: '#06B6D4', source: require('../assets/instrukcje.pdf') },
    { id: 2, name: 'Schematy_Elektryczne.pdf', icon: 'lightning-bolt', color: '#EAB308', source: require('../assets/instrukcje.pdf') },
    { id: 3, name: 'Katalog_Czesci_2024.pdf', icon: 'cogs', color: '#A855F7', source: require('../assets/instrukcje.pdf') },
    { id: 4, name: 'Biuletyn_Serwisowy.pdf', icon: 'wrench-outline', color: '#3B82F6', source: require('../assets/instrukcje.pdf') },
    { id: 5, name: 'Kody_Bledow_Silnika.pdf', icon: 'engine-outline', color: '#EF4444', source: require('../assets/instrukcje.pdf') },
    { id: 6, name: 'Instrukcja_BHP_Wozki.pdf', icon: 'shield-check-outline', color: '#22C55E', source: require('../assets/instrukcje.pdf') },
];

/**
 * RightPanel Component
 * Handles the display of the file grid, the PDF Viewer, and image schematics.
 */
export default function RightPanel({
                                       currentSource,
                                       hasAskedQuestion,
                                       currentImage,
                                       isLoading,
                                       isListening,
                                       onMicPress,
                                       selectedPdf, 
                                       onSelectPdf,
                                       showSchema,
                                       setShowSchema,
                                       setCurrentImage
                                   }: any) {

    const getInvertedImageHtml = (imageUrl: string) => `
      <!DOCTYPE html>
      <html>
      <head>
         <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
         <style>
            html, body { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #000000; display: flex; justify-content: center; align-items: center; overflow: hidden; }
            img { width: 100%; height: 100%; object-fit: contain; filter: invert(100%); }
         </style>
      </head>
      <body><img src="${imageUrl}" /></body>
      </html>
    `;

    // RENDER LOGIC:
    // 1. WebView (Schema) - Shown if there is an active image AND schema mode is toggled on.
    // 2. PdfViewer - Shown if there is an active image (but schema mode is off) OR a specific PDF is selected from the grid.
    // 3. Grid (Fallback) - Renders the grid of AVAILABLE_FILES if neither of the above conditions are met.
    
    return (
        <View className='flex-1 h-full flex-col pl-6'>
            <View className='w-full flex-row items-center mb-4 h-14'>
                <View className='flex-1' />
                <View className='flex-1 flex-row justify-end gap-3'>
                    <TouchableOpacity
                        onPress={() => {
                            onSelectPdf(null);
                            setShowSchema(false);
                            setCurrentImage(null);
                        }}
                        className='flex-row items-center border border-[#CC5500] px-4 py-3 rounded-md bg-[#0a0a0a]'
                    >
                        <MaterialCommunityIcons name="file-tree" size={18} color="#CC5500" />
                        <Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>POKAŻ PLIKI</Text>
                    </TouchableOpacity>

                    {currentImage && (
                        <TouchableOpacity
                            onPress={() => setShowSchema(!showSchema)}
                            className='flex-row items-center border border-[#CC5500] px-4 py-3 rounded-md bg-[#0a0a0a]'
                        >
                            <Feather name={showSchema ? "layers" : "image"} size={18} color="#CC5500" />
                            <Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>
                                {showSchema ? 'POKAŻ ŹRÓDŁO' : 'POKAŻ SCHEMAT'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View className='flex-1 rounded-xl overflow-hidden bg-black'>
                {currentImage && showSchema ? (
                    <WebView
                        source={{ html: getInvertedImageHtml(currentImage) }}
                        style={{ flex: 1, backgroundColor: 'transparent' }}
                        scrollEnabled={false}
                    />
                ) : (currentImage && !showSchema) || selectedPdf ? (
                    <View className="flex-1 relative">
                        <PdfViewer source={selectedPdf?.source || require('../assets/instrukcje.pdf')} />
                        <View className="absolute top-0 left-0 bg-[#121212] border border-neutral-800 px-3 py-2 rounded-br-lg flex-row items-center shadow-lg opacity-90 z-10">
                            <MaterialCommunityIcons 
                                name={(selectedPdf?.icon as any) || "file-pdf-box"} 
                                size={18} 
                                color={selectedPdf?.color || "#EF4444"} 
                            />
                            <Text className="text-slate-200 text-[11px] font-bold ml-2 tracking-widest uppercase">
                                {selectedPdf?.name || 'Dokument.pdf'}
                            </Text>
                        </View>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                        <View className='flex-row flex-wrap justify-center gap-4 px-4'>
                            {AVAILABLE_FILES.map((file) => (
                                <TouchableOpacity
                                    key={file.id}
                                    onPress={() => {
                                        onSelectPdf(file);
                                        setShowSchema(false);
                                    }}
                                    className='w-[30%] bg-[#121212] border border-neutral-800 rounded-2xl items-center justify-center py-6 px-3'
                                >
                                    <MaterialCommunityIcons
                                        name={file.icon as any}
                                        size={56}
                                        color={file.color}
                                    />
                                    <Text
                                        className='text-white font-bold mt-4 text-[13px] text-center leading-4'
                                        numberOfLines={2}
                                    >
                                        {file.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                )}
            </View>
        </View>
    );
}