import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, Animated, Image } from 'react-native';
import { Buffer } from 'buffer';
import { 
    useAudioPlayer, 
    useAudioRecorder, 
    AudioModule, 
    RecordingPresets 
} from 'expo-audio';
import { Asset } from 'expo-asset';

import * as FileSystem from 'expo-file-system/legacy';
import RightPanel from "@/components/RightPanel";
import LeftPanel, { Message } from "@/components/LeftPanel";

/** Server URL depending on the platform (Android emulator vs others) */
const SERVER_URL = Platform.OS === 'android' 
  ? 'http://10.0.2.2:8000' 
  : 'http://127.0.0.1:8000';

/**
 * Main application screen.
 * Manages chat state, voice communication (STT Deepgram, TTS OpenAI),
 * streaming response logic from the custom API, and view states (right/left panel).
 */
export default function ChatScreen() {
    // --- UI & DATA STATE ---
    const [showSchema, setShowSchema] = useState<boolean>(true);
    const [selectedPdf, setSelectedPdf] = useState<any>(null);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [showTextInput, setShowTextInput] = useState<boolean>(false);
    const [inputText, setInputText] = useState<string>('');
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [currentSource, setCurrentSource] = useState<string>('02-8FGF15');
    

    // --- CHAT STATE ---
    const initialMessage = 'Cześć. Jestem gotowy. Wybierz maszynę lub zadaj pytanie o naprawę.';
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, sender: 'ai', text: initialMessage },
    ]);

    // --- AUDIO & RECORDING ---
    const ttsPlayer = useAudioPlayer(null);
    const audioRecorder = useAudioRecorder({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
    });
    
    // --- LISTENING LOGIC REFERENCES ---
    const userSpeakingMessageIdRef = useRef<number>(0);
    const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const soundLevelAnim = useRef(new Animated.Value(0.2)).current; 
    const lastLoudTime = useRef<number>(0);
    const hasSpoken = useRef<boolean>(false);
    
    // --- SILENCE CONFIGURATION (Auto-stop) ---
    const silenceThreshold = -50;
    const silenceDuration = 2500;
    const initialSilenceDuration = 5000;

    /** Initialize audio module */
    useEffect(() => {
        AudioModule.setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: true,
        });

        return () => {
            if (meteringIntervalRef.current) clearInterval(meteringIntervalRef.current);
        };
    }, []);

    /** Update view upon image change */
    useEffect(() => {
        if (currentImage) setShowSchema(true);
    }, [currentImage]);

    /**
     * Sends text to the OpenAI API to generate speech (Text-to-Speech)
     * and plays it automatically.
     * @param text Text to be read by the AI.
     */
    const playChatGptAudio = async (text: string) => {
        try {
            setIsLoading(true);
            const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

            if (!apiKey) {
                alert("Missing API Key! Restart Expo with: npx expo start -c");
                setIsLoading(false);
                return;
            }
        
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey.trim()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'alloy',
                }),
            });

            if (!response.ok) throw new Error(`OpenAI API connection error: ${response.status}`);

            if (Platform.OS === 'web') {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                ttsPlayer.replace(url);
                ttsPlayer.play();
            } else {
                const arrayBuffer = await response.arrayBuffer();
                const base64data = Buffer.from(arrayBuffer).toString('base64');
                const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';
                
                await FileSystem.writeAsStringAsync(fileUri, base64data, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                ttsPlayer.replace(fileUri);
                ttsPlayer.play();
            }
        } catch (error) {
            console.error('ChatGPT TTS playback error:', error);
            alert('Failed to generate audio.');
        } finally {
            setIsLoading(false);
        }
    };

    /**
 * Sends a user query to the RAG backend, streams the SSE response token by token,
 * updates the chat UI, and plays the TTS audio upon completion.
 * Also extracts source metadata if provided by the backend.
 *
 * @param {string} question - The input text from the user to send to the API.
 */
const askAPI = async (question: string) => {
        setIsLoading(true);
        const aiMessageId = Date.now() + Math.random(); 
        
        const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || "";
        
        setMessages((prev) => [
            ...prev,
            { id: aiMessageId, sender: 'ai', text: '' },
        ]);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SERVER_URL}/api/questions`, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Accept', 'text/plain');

        if (AUTH_TOKEN) {
            xhr.setRequestHeader('Authorization', `Bearer ${AUTH_TOKEN}`);
        }

        let fullText = '';
        let spinnerRemoved = false;
        let lastResponse = '';
        let buffer = '';
        let currentEventType = 'message'; 

        xhr.onreadystatechange = () => {
            if (xhr.readyState === 3 || xhr.readyState === 4) {
                const currentResponse = xhr.responseText;
                if (!currentResponse) return;

                let newData = '';

                if (lastResponse.length > 0 && currentResponse.startsWith(lastResponse)) {
                    newData = currentResponse.substring(lastResponse.length);
                } else {
                    newData = currentResponse; 
                }
                lastResponse = currentResponse;

                buffer += newData;
                const lines = buffer.split('\n');
                
                if (xhr.readyState === 3) {
                    buffer = lines.pop() || '';
                } else {
                    buffer = '';
                }

                let textUpdated = false;

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    
                    if (!trimmedLine) {
                        currentEventType = 'message';
                        continue;
                    }

                    if (trimmedLine.startsWith('event:')) {
                        const eventName = trimmedLine.substring(6).trim();
                        if (eventName === '[DONE]') continue; 
                        currentEventType = eventName;
                        continue;
                    }

                    if (trimmedLine.startsWith('data:')) {
                        const chunk = trimmedLine.substring(5).trim();
                        if (!chunk) continue;

                        if (currentEventType === 'source') {
                            try {
                                const sourceData = JSON.parse(chunk);
                                // TODO: Handle source data (e.g., setCurrentSource(sourceData.file_name))
                            } catch (e) {
                                console.error("Source parsing error:", e);
                            }
                        } 
                        else if (currentEventType === 'token') {
                            try {
                                const token = JSON.parse(chunk);
                                if (typeof token === 'string') {
                                    fullText += token;
                                    textUpdated = true;
                                } else if (token && typeof token.text === 'string') {
                                    fullText += token.text;
                                    textUpdated = true;
                                }
                            } catch (e) {
                                fullText += chunk;
                                textUpdated = true;
                            }
                        }
                    }
                }

                if (textUpdated || xhr.readyState === 4) {
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
            }
        };

        xhr.onload = () => {
            setIsLoading(false);
            if (xhr.status >= 200 && xhr.status < 300) {
                setCurrentSource('02-8FGF15'); 
                
                const rawAsset = require('@/assets/schemas/schemat1.png');
                let schemaAsset;

                if (Platform.OS === 'web') {
                    if (typeof rawAsset === 'string') {
                        schemaAsset = rawAsset;
                    } else if (rawAsset?.uri) {
                        schemaAsset = rawAsset.uri; 
                    } else if (rawAsset?.default) {
                        schemaAsset = rawAsset.default; 
                    } else {
                        schemaAsset = rawAsset; 
                    }
                } else {
                    schemaAsset = Image.resolveAssetSource(rawAsset).uri;
                }

                setCurrentImage(schemaAsset);
                setShowSchema(true); 

                if (fullText.length > 0) {
                    playChatGptAudio(fullText);
                }
            } else {
                handleError(`HTTP Error: ${xhr.status}`);
            }
        };

        xhr.onerror = () => handleError('Server connection error.');
        xhr.ontimeout = () => handleError('Response timeout exceeded.');

        const handleError = (errorDetails: string) => {
            setIsLoading(false);
            const errorMsg = `Sorry, an issue occurred: ${errorDetails}`;
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === aiMessageId && !fullText ? { ...msg, text: errorMsg } : msg
                )
            );
        };

        xhr.send(JSON.stringify({ question: question }));
    };

    /** Handles sending a text question from the input field */
    const handleSendText = () => {
        if (inputText.trim().length === 0) return;

        const userTempId = Date.now();
        setMessages((prev) => [
            ...prev,
            { id: userTempId, sender: 'user', text: inputText.trim(), isSpeaking: false },
        ]);

        askAPI(inputText.trim());

        setInputText('');
        setShowTextInput(false);
    };

    /**
     * Sends the recorded audio file to the Deepgram API (Speech-to-Text),
     * and then passes the transcribed text to the backend (`askAPI`).
     * @param uri Path to the local audio file.
     */
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

            if (!response.ok) throw new Error(`Deepgram Error ${response.status}`);

            const data = await response.json();
            const transcript = data.results?.channels[0]?.alternatives[0]?.transcript || '';

            if (transcript.trim().length > 0) {
                setMessages((prev) => prev.map(msg => 
                    msg.id === userSpeakingMessageIdRef.current 
                    ? { ...msg, text: transcript, isSpeaking: false }
                    : msg
                ));
                askAPI(transcript);
            } else {
                setMessages((prev) => prev.filter(msg => msg.id !== userSpeakingMessageIdRef.current));
                setIsLoading(false);
            }
        } catch (error) {
            console.error('Deepgram Error:', error);
            setMessages((prev) => prev.filter(msg => msg.id !== userSpeakingMessageIdRef.current));
            setIsLoading(false);
        }
    };

    /** Stops the recording, clears the monitoring interval, and sends the audio to Deepgram. */
    const stopRecordingAndSend = async () => {
        if (meteringIntervalRef.current) {
            clearInterval(meteringIntervalRef.current);
            meteringIntervalRef.current = null;
        }
        
        setIsListening(false);

        if (audioRecorder.isRecording) {
            try {
                await audioRecorder.stop();
                const uri = audioRecorder.uri;
                if (uri) sendToDeepgram(uri);
            } catch (error) {
                console.error('Error while stopping recording:', error);
            }
        }
    };

    /** 
     * Monitors microphone volume during recording. 
     * Animates the waveform indicator and detects prolonged silence to automatically stop recording.
     */
    const startMetering = () => {
        lastLoudTime.current = Date.now();
        hasSpoken.current = false;

        meteringIntervalRef.current = setInterval(() => {
            const status = audioRecorder.getStatus();
            
            if (!status.isRecording) return;
            
            const metering = status.metering ?? -160; 
            const now = Date.now();

            let newScale = 0.2;
            if (metering > -50) {
                newScale = ((metering + 50) / 50) * (1.5 - 0.2) + 0.2;
            }
            newScale = Math.max(0.2, Math.min(1.5, newScale));

            Animated.timing(soundLevelAnim, {
                toValue: newScale,
                duration: 100, 
                useNativeDriver: true,
            }).start();

            if (metering > silenceThreshold) {
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
        }, 100);
    };

    /** 
     * Main microphone button handler. 
     * Toggles between starting the listener (requests permissions, starts metering) and stopping the recording.
     */
    const handleMicPress = async () => {
        if (ttsPlayer.playing) {
            ttsPlayer.pause();
        }

        if (showTextInput) setShowTextInput(false);

        if (isListening) {
            await stopRecordingAndSend();
        } else {
            setIsListening(true);

            const userTempId = Date.now();
            userSpeakingMessageIdRef.current = userTempId;
            soundLevelAnim.setValue(0.2); 
            
            setMessages((prev) => [
                ...prev,
                { id: userTempId, sender: 'user', text: '', isSpeaking: true },
            ]);

            try {
                const permission = await AudioModule.requestRecordingPermissionsAsync();
                if (!permission.granted) {
                    setIsListening(false);
                    setMessages((prev) => prev.filter(msg => msg.id !== userTempId));
                    return;
                }

                await audioRecorder.prepareToRecordAsync();
                audioRecorder.record();
                startMetering();

            } catch (err) {
                console.error('Error starting recording:', err);
                setIsListening(false);
                setMessages((prev) => prev.filter(msg => msg.id !== userTempId));
            }
        }
    };

    /** Variable controlling the visibility of the AI "typing" loading animation in the left panel */
    const isBotTyping = isLoading && !messages.some(m => m.sender === 'ai' && m.text === '');

    return (
        <View className='flex-1 flex-row bg-black p-4'>
            <LeftPanel
                messages={messages}
                isLoading={isBotTyping}
                isListening={isListening}
                onMicPress={handleMicPress}
                soundLevelAnim={soundLevelAnim}
                showTextInput={showTextInput}
                setShowTextInput={setShowTextInput}
                inputText={inputText}
                setInputText={setInputText}
                onSendText={handleSendText}
                currentSource={currentSource}
            />
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
