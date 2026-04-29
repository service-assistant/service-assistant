import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

// Odtwarzanie i nagrywanie audio
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';

import RightPanel from "@/components/RightPanel";
import { useRouter } from "expo-router";

// --- 1. NOWY KOMPONENT DYNAMICZNEGO WYKRESU DŹWIĘKU ---
// Komponent renderuje serię pionowych pasków, których wysokość jest 
// bezpośrednio kontrolowana przez natywną animację.
const SoundWaveformIndicator = ({ soundLevel }: { soundLevel: Animated.Value }) => {
    const bars = Array.from({ length: 8 }, (_, i) => i); // 8 pasków

    return (
        <View style={styles.waveformContainer}>
            {bars.map((i) => (
                <Animated.View
                    key={i}
                    style={[
                        styles.waveformBar,
                        {
                            // transform: scaleY zapewnia najlepszą wydajność na Androidzie
                            // i daje płynny efekt rozszerzania/kurczenia pasków.
                            transform: [{ scaleY: soundLevel }],
                            // Dodajemy małe opóźnienia wizualne dla każdego paska
                            opacity: soundLevel.interpolate({
                                inputRange: [0.2, 1.5],
                                outputRange: [0.4, 1],
                                extrapolate: 'clamp'
                            }),
                            // Paski na zewnątrz są mniejsze
                            height: 16 - Math.abs(i - 3.5) * 2,
                        },
                    ]}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    waveformContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 20,
        gap: 3, // Przestrzeń między paskami
    },
    waveformBar: {
        width: 3,
        backgroundColor: 'white',
        borderRadius: 1.5,
    },
});

// Konfiguracja adresu serwera
const SERVER_URL = 'http://10.0.2.2:8000'; // Używamy 10.0.2.2 dla emulatora Androida

interface Message {
    id: number;
    sender: 'ai' | 'user';
    text: string;
    isSpeaking?: boolean; // Nowa właściwość dla wykresu dźwięku
}

export default function HomeScreen() {
    const router = useRouter();
    const [showSchema, setShowSchema] = useState<boolean>(true);
    const [selectedPdf, setSelectedPdf] = useState<any>(null);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const recordingRef = useRef<Audio.Recording | null>(null);
    const userSpeakingMessageIdRef = useRef<number>(0);

    // --- 2. ANIMOWANA WARTOŚĆ DLA GŁOŚNOŚCI (NATYWNA) ---
    // soundLevelAnim jest 'refem' aby utrzymać obiekt Animated.Value 
    // stabilnym przez cały cykl życia komponentu.
    const soundLevelAnim = useRef(new Animated.Value(0.2)).current; // Startujemy z minimum (cisza)

    const lastLoudTime = useRef<number>(0);
    const hasSpoken = useRef<boolean>(false);
    const silenceThreshold = -50;
    const silenceDuration = 2500;
    const initialSilenceDuration = 5000;

    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [currentSource, setCurrentSource] = useState<string>('02-8FGF15');

    const initialMessage = 'Cześć. Jestem gotowy. Wybierz maszynę lub zadaj pytanie o naprawę.';
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, sender: 'ai', text: initialMessage },
    ]);

    const playChatGptAudio = async (text: string) => {
        try {
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.EXPO_PUBLIC_OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'alloy',
                }),
            });

            if (!response.ok) throw new Error('Błąd połączenia z API OpenAI');

            const blob = await response.blob();

            if (Platform.OS === 'web') {
                const url = URL.createObjectURL(blob);
                const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
                sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
                    if (status.isLoaded && status.didJustFinish) {
                        sound.unloadAsync();
                        URL.revokeObjectURL(url);
                    }
                });
            } else {
                const reader = new FileReader();
                reader.onload = async () => {
                    if (typeof reader.result === 'string') {
                        const base64data = reader.result.split(',')[1];
                        const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';
                        await FileSystem.writeAsStringAsync(fileUri, base64data, {
                            encoding: 'base64',
                        });

                        const { sound } = await Audio.Sound.createAsync(
                            { uri: fileUri },
                            { shouldPlay: true },
                        );
                        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
                            if (status.isLoaded && status.didJustFinish) {
                                sound.unloadAsync();
                            }
                        });
                    }
                };
                reader.readAsDataURL(blob);
            }
        } catch (error) {
            console.error('Błąd odtwarzania ChatGPT TTS:', error);
        }
    };

    useEffect(() => {
        Audio.setAudioModeAsync({
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            allowsRecordingIOS: true,
        });
    }, []);

    useEffect(() => {
        if (currentImage) setShowSchema(true);
    }, [currentImage]);

    // askAPI - BEZ ZMIAN W STOSUNKU DO POPRZEDNIEJ WERSJI
    const askAPI = async (question: string) => {
        setIsLoading(true);
        console.log(`[RAG API] Otwieram strumień do ${SERVER_URL}/api/questions`);

        const aiMessageId = Date.now() + Math.random(); 
        
        setMessages((prev) => [
            ...prev,
            { id: aiMessageId, sender: 'ai', text: '' },
        ]);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SERVER_URL}/api/questions`, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/plain');

        let fullText = '';
        let spinnerRemoved = false;

        xhr.onreadystatechange = () => {
            if (xhr.readyState === 3 || xhr.readyState === 4) {
                const rawResponse = xhr.responseText;
                
                const chunks = rawResponse.split("data: ").filter(Boolean);
                let combinedText = "";

                for (const chunk of chunks) {
                    try {
                        const token = JSON.parse(chunk.trim());
                        combinedText += token;
                    } catch (e) {
                        // Ignorujemy błędy parsowania
                    }
                }

                fullText = combinedText;

                if (!spinnerRemoved && fullText.length > 0) {
                    setIsLoading(false);
                    spinnerRemoved = true;
                }

                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === aiMessageId ? { ...msg, text: fullText } : msg
                    )
                );
            }
        };

        xhr.onload = () => {
            console.log(`[RAG API] Strumień zakończony. Status: ${xhr.status}`);
            setIsLoading(false);
            
            if (xhr.status >= 200 && xhr.status < 300) {
                setCurrentSource('02-8FGF15'); 
                setCurrentImage(null);
                playChatGptAudio(fullText);
            } else {
                handleError(`Błąd HTTP: ${xhr.status}`);
            }
        };

        xhr.onerror = () => handleError('Błąd połączenia z serwerem.');
        xhr.ontimeout = () => handleError('Przekroczono czas oczekiwania na odpowiedź.');

        const handleError = (errorDetails: string) => {
            setIsLoading(false);
            const errorMsg = `Przepraszam, wystąpił problem: ${errorDetails}`;
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === aiMessageId && !fullText ? { ...msg, text: errorMsg } : msg
                )
            );
        };

        xhr.send(JSON.stringify({ question: question }));
    };

    // ZAKTUALIZOWANA FUNKCJA sendToDeepgram - NATYCHMIASTOWY TRANSKRYPT
    const sendToDeepgram = async (uri: string) => {
        setIsLoading(true);
        try {
            const responseFile = await fetch(uri);
            const audioBlob = await responseFile.blob();

            const response = await fetch(
                'https://api.deepgram.com/v1/listen?model=nova-3&numerals=true&language=pl&smart_format=true',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Token ${process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY}`,
                        'Content-Type': 'audio/m4a',
                    },
                    body: audioBlob,
                },
            );

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Deepgram Error ${response.status}: ${errorData}`);
            }

            const data = await response.json();
            const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

            if (transcript.trim().length > 0) {
                // Wyświetlenie transkryptu usera i zamiana dymka z wykresu na tekst
                setMessages((prev) => prev.map(msg => 
                    msg.id === userSpeakingMessageIdRef.current 
                    ? { ...msg, text: transcript, isSpeaking: false }
                    : msg
                ));

                askAPI(transcript);
            } else {
                // Jeśli cisza, usuwamy dymek z wykresem
                setMessages((prev) => prev.filter(msg => msg.id !== userSpeakingMessageIdRef.current));
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Błąd Deepgram:', error);
            // W razie błędu usuwamy wykres
            setMessages((prev) => prev.filter(msg => msg.id !== userSpeakingMessageIdRef.current));
            setIsLoading(false);
        }
    };

    const stopRecordingAndSend = async () => {
        const recObj = recordingRef.current;
        if (!recObj) return;

        recordingRef.current = null;
        setIsListening(false);

        try {
            await recObj.stopAndUnloadAsync();
            const uri = recObj.getURI();
            if (uri) sendToDeepgram(uri);
        } catch (error) {
            console.error('Błąd podczas zatrzymywania:', error);
        }
    };

    const onRecordingStatusUpdate = (status: Audio.RecordingStatus) => {
        if (!status.canRecord || !status.isRecording) return;
        const now = Date.now();

        if (status.metering !== undefined) {
            // --- 3. DRIVE'OWANIE WYKRESU DŹWIĘKU W CZASIE RZECZYWISTYM ---
            // Mapujemy logarithmiczną wartość meteringu (dB) na liniową wysokość (scale)
            // Range map: [-50, 0] dB -> [0.2, 1.5] scale
            let newScale = 0.2;
            if (status.metering > -50) {
                newScale = ((status.metering + 50) / 50) * (1.5 - 0.2) + 0.2;
            }
            newScale = Math.max(0.2, Math.min(1.5, newScale)); // Clamping

            // Natychmiastowa natywna animacja
            Animated.timing(soundLevelAnim, {
                toValue: newScale,
                duration: 0, // Natychmiastowy update
                useNativeDriver: true,
            }).start();


            if (status.metering > silenceThreshold) {
                lastLoudTime.current = now;
                hasSpoken.current = true;
            } else {
                if (hasSpoken.current) {
                    if (now - lastLoudTime.current > silenceDuration) {
                        stopRecordingAndSend();
                    }
                } else {
                    if (now - lastLoudTime.current > initialSilenceDuration) {
                        stopRecordingAndSend();
                    }
                }
            }
        }
    };

    const handleMicPress = async () => {
        if (isListening) {
            setIsListening(false);
            await stopRecordingAndSend();
        } else {
            setIsListening(true);

            // === 1. ZMIANA: DYMEK USERA Z WYKRESEM DŹWIĘKU ===
            const userTempId = Date.now();
            userSpeakingMessageIdRef.current = userTempId;
            // Resetujemy animację do ciszy przy starcie
            soundLevelAnim.setValue(0.2); 
            setMessages((prev) => [
                ...prev,
                { id: userTempId, sender: 'user', text: '', isSpeaking: true }, // Placeholder
            ]);

            setTimeout(async () => {
                try {
                    const { granted } = await Audio.requestPermissionsAsync();
                    if (!granted) {
                        setIsListening(false);
                        // Usuwamy dymek jeśli brak uprawnień
                        setMessages((prev) => prev.filter(msg => msg.id !== userTempId));
                        return;
                    }

                    hasSpoken.current = false;

                    const { recording: newRecording } = await Audio.Recording.createAsync(
                        {
                            ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
                            android: {
                                ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
                                // @ts-ignore
                                isMeteringEnabled: true,
                            },
                            ios: {
                                ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
                                isMeteringEnabled: true,
                            },
                        },
                        onRecordingStatusUpdate,
                        100,
                    );

                    lastLoudTime.current = Date.now();
                    recordingRef.current = newRecording;

                } catch (err) {
                    console.error('Błąd startu nagrywania:', err);
                    setIsListening(false);
                    // Usuwamy dymek w razie błędu
                    setMessages((prev) => prev.filter(msg => msg.id !== userTempId));
                }
            }, 50);
        }
    };

    return (
        <View className='flex-1 flex-row bg-black p-4'>

            {/* LEWY PANEL (Pływający Chat) */}
            <View className='w-[32%] h-full flex flex-col'>

                <View className='w-full h-14 mb-4 flex-row items-center'>
                    <TouchableOpacity className='flex-row items-center border border-[#CC5500] px-4 py-3 rounded-md bg-[#0a0a0a]' onPress={() => router.push('/home')}>
                        <Feather name="arrow-left" size={18} color="#CC5500" />
                        <Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>WSTECZ</Text>
                    </TouchableOpacity>

                    <Text className='text-neutral-600 mx-4 text-xl'>|</Text>

                    <Image
                        source={require('../../assets/images/toyota.png')}
                        style={{ width: 70, height: 20 }}
                        resizeMode="contain"
                    />

                    <Text className='text-slate-200 font-bold ml-4 tracking-widest text-sm uppercase'>
                        02-8FGF15
                    </Text>
                </View>

                <View className='flex-1 border border-[#CC5500] rounded-2xl bg-[#09090B] flex-col overflow-hidden'>
                    <View className='p-4 border-b border-neutral-800 flex-row items-center'>
                        <View className='w-15 h-15 rounded-md border border-[#CC5500] items-center justify-center mr-3'>
                            <Image
                                source={require('../../assets/images/robot.png')}
                                style={{ width: 40, height: 40, tintColor: '#CC5500' }}
                                resizeMode="contain"
                            />
                        </View>
                        <View>
                            <Text className='text-slate-200 font-bold tracking-widest text-xs'>FLT ASYSTENT</Text>
                            <View className='flex-row items-center mt-1'>
                                <View className='w-2 h-2 rounded-full bg-green-500 mr-1.5' />
                                <Text className='text-green-500 font-bold tracking-widest text-[10px]'>System Online</Text>
                            </View>
                        </View>
                    </View>

                    <ScrollView className='flex-1 p-4'>
                        <View className='flex flex-col gap-4 pb-4'>
                            {messages.map((msg) =>
                                msg.sender === 'ai' ? (
                                    <View key={msg.id} className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-4 py-3 self-start max-w-[90%]'>
                                        <Text className='text-slate-300 text-[14px] leading-5'>{msg.text}</Text>
                                    </View>
                                ) : (
                                    <View key={msg.id} className='bg-[#A64D00] rounded-2xl rounded-tr-sm px-4 py-3 self-end max-w-[90%]'>
                                        {/* === 4. WYŚWIETLANIE WYKRESU DŹWIĘKU LUB TEKSTU === */}
                                        {msg.isSpeaking ? (
                                            <SoundWaveformIndicator soundLevel={soundLevelAnim} />
                                        ) : (
                                            <Text className='text-white text-[14px] leading-5'>{msg.text}</Text>
                                        )}
                                    </View>
                                ),
                            )}

                            {/* --- NAPRAWA PUSTEGO DYMKA --- */}
                            {isLoading && !messages.some(m => m.sender === 'ai' && m.text === '') && (
                                <View className='bg-[#1E1E22] rounded-2xl px-4 py-3 self-start flex-row items-center'>
                                    <ActivityIndicator size='small' color='#CC5500' />
                                    <Text className='text-slate-400 text-xs ml-3'>Przetwarzanie...</Text>
                                </View>
                            )}
                        </View>
                    </ScrollView>

                    <View className='w-full px-4 py-6 flex-row justify-center items-center gap-6 border-t border-neutral-900'>

                        <TouchableOpacity className='w-[72px] h-[72px] bg-[#121212] border border-black rounded-[12px] items-center justify-center'>
                            <Image
                                source={require('../../assets/images/camera.png')}
                                style={{ width: 32, height: 32, tintColor: '#A3A3A3' }}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>

                        <View className='items-center flex-col gap-3'>
                            <TouchableOpacity
                                onPressIn={handleMicPress}
                                className={`w-[112px] h-[112px] rounded-[12px] items-center justify-center ${
                                    isListening ? 'bg-[#2A1100] border-2 border-[#FF6600]' : 'bg-[#121212] border border-black'
                                }`}
                            >
                                <Image
                                    source={require('../../assets/images/micro.png')}
                                    style={{ width: 56, height: 56, tintColor: isListening ? '#FF6600' : '#A3A3A3' }}
                                    resizeMode="contain"
                                />
                            </TouchableOpacity>
                            <Text className={`text-[10px] font-bold tracking-widest ${isListening ? 'text-[#FF6600]' : 'text-[#A3A3A3]'}`}>
                                {isListening ? 'SŁUCHAM...' : 'NACIŚNIJ ŻEBY MÓWIĆ'}
                            </Text>
                        </View>

                        <TouchableOpacity className='w-[72px] h-[72px] bg-[#121212] border border-black rounded-[12px] items-center justify-center'>
                            <Image
                                source={require('../../assets/images/search.png')}
                                style={{ width: 32, height: 32, tintColor: '#A3A3A3' }}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>

                    </View>
                </View>
            </View>

            {/* PRAWY PANEL */}
            <RightPanel
                currentSource={currentSource}
                hasAskedQuestion={messages.length > 1}
                currentImage={currentImage}
                isLoading={isLoading}
                isListening={isListening}
                onMicPress={handleMicPress}
                selectedPdf={selectedPdf}
                showSchema={showSchema}
                setShowSchema={setShowSchema}
                onSelectPdf={(pdf: any) => {
                    setSelectedPdf(pdf);
                    setShowSchema(false);
                }}
                setCurrentImage={setCurrentImage}
            />
        </View>
    );
}