import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import PdfViewer from './PdfViewer';

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

    return (
        <View className='flex-1 h-full flex-col pl-6'>

            {/* --- GÓRNE PRZYCISKI NAWIGACJI --- */}
            <View className='w-full flex-row items-center mb-4 h-14'>

                {/* LEWA STRONA: Pusta dla balansu */}
                <View className='flex-1' />



                {/* PRAWA STRONA: Grupa przycisków akcji */}
                <View className='flex-1 flex-row justify-end gap-3'>
                    {/* Przycisk PLIKI (Powiększony) */}
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

                    {/* Przycisk przełączania SCHEMAT / ŹRÓDŁO (Powiększony) */}
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

            {/* --- GŁÓWNY KONTENT --- */}
            <View className='flex-1 rounded-xl overflow-hidden bg-black'>
                {currentImage && showSchema ? (
                    <WebView
                        source={{ html: getInvertedImageHtml(currentImage) }}
                        style={{ flex: 1, backgroundColor: 'transparent' }}
                        scrollEnabled={false}
                    />
                ) : (currentImage && !showSchema) || selectedPdf ? (
                    <PdfViewer source={require('../assets/instrukcje.pdf')} />
                ) : (
                    // WIDOK DOMYŚLNY: Dashboard plików (3 W RZĘDZIE)
                    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                        <View className='flex-row flex-wrap justify-center gap-4 px-4'>
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <TouchableOpacity
                                    key={i}
                                    onPress={() => {
                                        onSelectPdf(require('../assets/instrukcje.pdf'));
                                        setShowSchema(false);
                                    }}
                                    className='w-[30%] bg-[#121212] border border-neutral-800 rounded-2xl items-center justify-center py-6 px-3'
                                >
                                    <MaterialCommunityIcons
                                        name={i % 3 === 0 ? "forklift" : i % 2 === 0 ? "database-search-outline" : "alert-circle-outline"}
                                        size={56}
                                        color={i % 3 === 0 ? "#06B6D4" : i % 2 === 0 ? "#94A3B8" : "#EF4444"}
                                    />
                                    <Text
                                        className='text-white font-bold mt-4 text-[13px] text-center leading-4'
                                        numberOfLines={2}
                                    >
                                        instrukcja_instrukcja_instrukcja_instrukcja_instrukcja_{i}.pdf
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