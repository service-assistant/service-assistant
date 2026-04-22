import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    Animated,
    Easing,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

export interface Message {
    id: number;
    sender: 'ai' | 'user';
    text: string;
}

interface LeftPanelProps {
    messages: Message[];
    isLoading: boolean;
    isListening: boolean;
    onMicPress: () => void;
}

// --- ANIMACJA CZEKANIA BOTA (Skaczące kropki) ---
const BotTypingAnimation = () => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animateDot = (v: Animated.Value, delay: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(v, {
                        toValue: -6,
                        duration: 400,
                        easing: Easing.bezier(0.4, 0, 0.6, 1),
                        useNativeDriver: true,
                    }),
                    Animated.timing(v, {
                        toValue: 0,
                        duration: 400,
                        easing: Easing.bezier(0.4, 0, 0.6, 1),
                        useNativeDriver: true,
                    }),
                ])
            );
        };

        const animation = Animated.parallel([
            animateDot(dot1, 0),
            animateDot(dot2, 200),
            animateDot(dot3, 400),
        ]);

        animation.start();
        return () => animation.stop();
    }, []);

    return (
        <View className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-5 py-4 self-start flex-row items-center'>
            {[dot1, dot2, dot3].map((v, i) => (
                <Animated.View
                    key={i}
                    style={{ transform: [{ translateY: v }] }}
                    className="w-1.5 h-1.5 bg-[#CC5500] rounded-full mx-0.5"
                />
            ))}
            <Text className='text-slate-400 text-[10px] ml-3 font-bold tracking-widest uppercase'>Myślę...</Text>
        </View>
    );
};

// --- ANIMACJA PULSOWANIA (Technik mówi) ---
const ListeningPulse = () => {
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.parallel([
                Animated.timing(scale, {
                    toValue: 1.5,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return (
        <Animated.View
            style={{ transform: [{ scale }], opacity }}
            className="absolute w-full h-full rounded-[12px] border-2 border-[#FF6600]"
        />
    );
};

export default function LeftPanel({ messages, isLoading, isListening, onMicPress }: LeftPanelProps) {
    const scrollViewRef = useRef<ScrollView>(null);

    return (
        <View className='w-[32%] h-full flex flex-col'>
            {/* Przycisk WSTECZ */}
            <View className='w-full h-14 mb-4 flex-row items-center'>
                <TouchableOpacity className='flex-row items-center border border-[#CC5500] px-4 py-3 rounded-md bg-[#0a0a0a]'>
                    <Feather name="arrow-left" size={18} color="#CC5500" />
                    <Text className='text-[#CC5500] font-bold ml-2 tracking-widest text-[11px] uppercase'>WSTECZ</Text>
                </TouchableOpacity>
            </View>

            <View className='flex-1 border border-[#CC5500] rounded-2xl bg-[#09090B] flex-col overflow-hidden shadow-2xl'>
                {/* Header */}
                <View className='p-4 border-b border-neutral-800 flex-row items-center bg-[#0d0d0f]'>
                    <View className='w-8 h-8 rounded-md border border-[#CC5500] items-center justify-center mr-3'>
                        <MaterialCommunityIcons name="robot-outline" size={20} color="#CC5500" />
                    </View>
                    <View>
                        <Text className='text-slate-200 font-bold tracking-widest text-xs'>FLT ASYSTENT</Text>
                        <View className='flex-row items-center mt-1'>
                            <View className='w-2 h-2 rounded-full bg-green-500 mr-1.5' />
                            <Text className='text-green-500 font-bold tracking-widest text-[10px]'>SYSTEM ONLINE</Text>
                        </View>
                    </View>
                </View>

                {/* Historia rozmowy */}
                <ScrollView
                    ref={scrollViewRef}
                    onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                    className='flex-1 p-4'
                >
                    <View className='flex flex-col gap-4 pb-4'>
                        {messages.map((msg) =>
                            msg.sender === 'ai' ? (
                                <View key={msg.id} className='bg-[#1E1E22] rounded-2xl rounded-tl-sm px-4 py-3 self-start max-w-[90%]'>
                                    <Text className='text-slate-300 text-[14px] leading-5'>{msg.text}</Text>
                                </View>
                            ) : (
                                <View key={msg.id} className='bg-[#A64D00] rounded-2xl rounded-tr-sm px-4 py-3 self-end max-w-[90%]'>
                                    <Text className='text-white text-[14px] leading-5'>{msg.text}</Text>
                                </View>
                            ),
                        )}

                        {/* Animacja bota gdy czeka na serwer */}
                        {isLoading && <BotTypingAnimation />}
                    </View>
                </ScrollView>

                {/* Panel sterowania */}
                <View className='w-full px-4 py-6 flex-row justify-center items-center gap-6 border-t border-neutral-900 bg-[#0d0d0f]'>

                    <TouchableOpacity className='w-[72px] h-[72px] bg-[#121212] border border-black rounded-[12px] items-center justify-center'>
                        <Image
                            source={require('../assets/images/camera.png')}
                            style={{ width: 32, height: 32, tintColor: '#A3A3A3' }}
                        />
                    </TouchableOpacity>

                    <View className='items-center flex-col gap-3'>
                        <TouchableOpacity
                            onPressIn={onMicPress}
                            className={`w-[112px] h-[112px] rounded-[12px] items-center justify-center ${
                                isListening ? 'bg-[#2A1100] border-2 border-[#FF6600]' : 'bg-[#121212] border border-black'
                            }`}
                        >
                            {/* Animacja pulsu gdy technik mówi */}
                            {isListening && <ListeningPulse />}

                            <Image
                                source={require('../assets/images/micro.png')}
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
                            source={require('../assets/images/search.png')}
                            style={{ width: 32, height: 32, tintColor: '#A3A3A3' }}
                        />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}