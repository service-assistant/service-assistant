import React, { useRef, useState } from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import PdfViewer from './PdfViewer';
import * as FileSystem from 'expo-file-system/legacy';
import { View, Text, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';

const AVAILABLE_FILES = [
    { id: 1, name: 'Instrukcja_Obslugi_Toyota.pdf', icon: 'forklift', color: '#06B6D4', source: require('../assets/instrukcje.pdf') },
    { id: 2, name: 'Schematy_Elektryczne.pdf', icon: 'lightning-bolt', color: '#EAB308', source: require('../assets/instrukcje.pdf') },
    { id: 3, name: 'Katalog_Czesci_2024.pdf', icon: 'cogs', color: '#A855F7', source: require('../assets/instrukcje.pdf') },
    { id: 4, name: 'Biuletyn_Serwisowy.pdf', icon: 'wrench-outline', color: '#3B82F6', source: require('../assets/instrukcje.pdf') },
    { id: 5, name: 'Kody_Bledow_Silnika.pdf', icon: 'engine-outline', color: '#EF4444', source: require('../assets/instrukcje.pdf') },
    { id: 6, name: 'Instrukcja_BHP_Wozki.pdf', icon: 'shield-check-outline', color: '#22C55E', source: require('../assets/instrukcje.pdf') },
];

const REMOTE_PDF_URL = 'https://staging.asystent-serwisanta.pl/api/attachments/get/55';
const DOWNLOADED_FILENAME = 'instrukcja_serwisowa.pdf';

const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || "";

/**
 * RightPanel Component
 * Handles the display of the file grid, the PDF Viewer, and image schematics.
 */
export default function RightPanel({
                                       currentSource,
                                       hasAskedQuestion,
                                       currentImage,
                                       isLoading: isApiLoading,
                                       isListening,
                                       onMicPress,
                                       selectedPdf, 
                                       onSelectPdf,
                                       showSchema,
                                       setShowSchema,
                                       setCurrentImage
                                   }: any) {

    const [isDownloading, setIsDownloading] = useState(false);
    const downloadResumableRef = useRef<FileSystem.DownloadResumable | null>(null);
    const [downloadingFileId, setDownloadingFileId] = useState<number | null>(null);
    
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

    // --- UNIFIED DOWNLOAD LOGIC ---
    const performDownload = async (remoteUrl: string, localFilename: string, displayName: string, fileIdForGrid: number | null = null) => {
        if (isDownloading) return;

        setIsDownloading(true);
        setDownloadingFileId(fileIdForGrid);

        try {
            // ARTIFICIAL DELAY - 5 SECONDS
            await new Promise(resolve => setTimeout(resolve, 5000));

            if (Platform.OS === 'web') {
                setShowSchema(false);
                onSelectPdf({
                    name: displayName,
                    icon: 'file-download',
                    color: '#22C55E',
                    source: { 
                        uri: remoteUrl,
                        headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
                    }
                });
            } else {
                const fileUri = FileSystem.documentDirectory + localFilename;
                
                downloadResumableRef.current = FileSystem.createDownloadResumable(
                    remoteUrl, 
                    fileUri, 
                    {
                        headers: {
                            'Authorization': `Bearer ${AUTH_TOKEN}`
                        }
                    }
                );
                
                const result = await downloadResumableRef.current.downloadAsync();
                
                if (result && result.uri) {
                    setShowSchema(false); 
                    onSelectPdf({
                        name: displayName,
                        icon: 'file-download',
                        color: '#22C55E',
                        source: { uri: result.uri } 
                    });
                } else {
                    throw new Error("Download failed - no URI");
                }
            }
        } catch (e) {
            console.error('Download error:', e);
            Alert.alert("Błąd", `Nie udało się pobrać pliku: ${displayName}`);
        } finally {
            setIsDownloading(false);
            setDownloadingFileId(null);
            downloadResumableRef.current = null;
        }
    };

    const handleFileGridPress = async (file: typeof AVAILABLE_FILES[0]) => {
        await performDownload(REMOTE_PDF_URL, DOWNLOADED_FILENAME, file.name, file.id);
    };

    const renderSourceButton = () => {
        if (!currentImage) return null;

        return (
            <TouchableOpacity
                onPress={() => {
                    if (showSchema) {
                        performDownload(REMOTE_PDF_URL, DOWNLOADED_FILENAME, 'Instrukcja_Serwisowa.pdf', null);
                    } else {
                        setShowSchema(true);
                    }
                }}
                disabled={isDownloading}
                className={`flex-row items-center border ${isDownloading ? 'border-neutral-700 bg-neutral-900' : 'border-[#CC5500] bg-[#0a0a0a]'} px-4 py-3 rounded-md min-w-[170px] justify-center`}
            >
                {isDownloading && downloadingFileId === null ? (
                    <View className="flex-row items-center">
                        <ActivityIndicator size="small" color="#fff" />
                        <Text className='text-white font-bold ml-3 tracking-widest text-[11px] uppercase'>
                            POBIERANIE...
                        </Text>
                    </View>
                ) : (
                    <View className="flex-row items-center">
                        <Feather name={showSchema ? "image" : "layers"} size={18} color="#CC5500" />
                        <Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>
                            {showSchema ? 'POKAŻ ŹRÓDŁO' : 'POKAŻ SCHEMAT'}
                        </Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View className='flex-1 h-full flex-col pl-6'>
            <View className='w-full flex-row items-center mb-4 h-14'>
                <View className='flex-1' />
                <View className='flex-1 flex-row justify-end gap-3'>
                    <TouchableOpacity
                        onPress={() => {
                            if (downloadResumableRef.current) {
                                downloadResumableRef.current.cancelAsync();
                            }
                            onSelectPdf(null);
                            setShowSchema(false);
                            setCurrentImage(null);
                            setIsDownloading(false);
                            setDownloadingFileId(null);
                        }}
                        disabled={isDownloading}
                        className={`flex-row items-center border ${isDownloading ? 'border-neutral-700' : 'border-[#CC5500]'} px-4 py-3 rounded-md bg-[#0a0a0a]`}
                    >
                        <MaterialCommunityIcons name="file-tree" size={18} color={isDownloading ? "#555" : "#CC5500"} />
                        <Text className={`${isDownloading ? 'text-neutral-600' : 'text-[#CC5500]'} font-bold ml-2 tracking-widest text-[11px] uppercase`}>POKAŻ PLIKI</Text>
                    </TouchableOpacity>

                    {renderSourceButton()}
                </View>
            </View>

            <View className='flex-1 rounded-xl overflow-hidden bg-black'>
                {currentImage && showSchema ? (
                    Platform.OS === 'web' ? (
                        <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                            <img 
                                src={currentImage} 
                                style={{ 
                                    width: '100%', 
                                    height: '100%', 
                                    objectFit: 'contain', 
                                    filter: 'invert(100%)'
                                }} 
                                alt="Schemat"
                            />
                        </View>
                    ) : (
                        <WebView
                            source={{ html: getInvertedImageHtml(currentImage) }}
                            style={{ flex: 1, backgroundColor: 'transparent' }}
                            scrollEnabled={false}
                        />
                    )
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
                            {AVAILABLE_FILES.map((file) => {
                                const isThisFileDownloading = isDownloading && downloadingFileId === file.id;

                                return (
                                    <TouchableOpacity
                                        key={file.id}
                                        onPress={() => handleFileGridPress(file)}
                                        disabled={isDownloading}
                                        className="w-[30%] border rounded-2xl items-center justify-center py-6 px-3 bg-[#121212] border-neutral-800 relative"
                                    >
                                        {isThisFileDownloading && (
                                            <Text className="absolute top-2 text-[#CC5500] font-bold text-[9px] tracking-widest uppercase">
                                                POBIERANIE...
                                            </Text>
                                        )}

                                        <View className="w-24 h-24 items-center justify-center relative">
                                            <MaterialCommunityIcons
                                                name={file.icon as any}
                                                size={64}
                                                color={file.color}
                                                style={{ opacity: 0.2 }}
                                            />
                                            
                                            <View className="absolute inset-0 items-center justify-center">
                                                {isThisFileDownloading ? (
                                                    <ActivityIndicator size="large" color="#fff" /> 
                                                ) : (
                                                    <Feather name="download-cloud" size={32} color="#fff" />
                                                )}
                                            </View>
                                        </View>

                                        <Text
                                            className="font-bold mt-4 text-[13px] text-center leading-4 text-neutral-500"
                                            numberOfLines={2}
                                        >
                                            {file.name}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </ScrollView>
                )}
            </View>
        </View>
    );
}
