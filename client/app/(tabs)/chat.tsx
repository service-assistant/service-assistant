import React, { useEffect, useRef, useState } from 'react';
import { Platform, View, Animated, Image, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Buffer } from 'buffer';
import { AudioModule, RecordingPresets, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, View } from 'react-native';

import LeftPanel, { Message } from '@/components/LeftPanel';
import RightPanel from '@/components/RightPanel';
import * as FileSystem from 'expo-file-system/legacy';

const SERVER_URL = 'https://staging.asystent-serwisanta.pl';

/**
 * Main application screen.
 * Manages chat state, voice communication (STT Deepgram, TTS OpenAI),
 * streaming response logic from the custom API, and view states (right/left panel).
 */
export default function ChatScreen() {
    const { width } = useWindowDimensions();
    const isMobile = width < 768; // Breakpoint for mobile

    // --- UI & DATA STATES ---
    const [showSchema, setShowSchema] = useState<boolean>(true);
    const [selectedPdf, setSelectedPdf] = useState<any>(null);
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // --- STOP CONTROL STATES ---
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

    const [showTextInput, setShowTextInput] = useState<boolean>(false);
    const [inputText, setInputText] = useState<string>('');
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const [currentSource, setCurrentSource] = useState<string>('02-8FGF15');
    const [attachmentPage, setAttachmentPage] = useState<number>(1);

    const [attachmentId, setAttachmentId] = useState<number | null>(null);
    const [attachmentName, setAttachmentName] = useState<string>('');

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

    // --- LOGIC REFERENCES ---
    const userSpeakingMessageIdRef = useRef<number>(0);
    const meteringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const soundLevelAnim = useRef(new Animated.Value(0.2)).current;
    const lastLoudTime = useRef<number>(0);
    const hasSpoken = useRef<boolean>(false);

    // --- REQUEST CANCELLATION REFERENCES ---
    const xhrRef = useRef<XMLHttpRequest | null>(null);
    const ttsAbortControllerRef = useRef<AbortController | null>(null);

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
            if (xhrRef.current) xhrRef.current.abort();
            if (ttsAbortControllerRef.current) ttsAbortControllerRef.current.abort();
        };
    }, []);

    /** Update view upon image change */
    useEffect(() => {
        if (currentImage) setShowSchema(true);
    }, [currentImage]);

    /** * AUDIO PLAYER TRACKING
     * Periodically checks if audio is still playing.
     */
    useEffect(() => {
        const interval = setInterval(() => {
            if (ttsPlayer && ttsPlayer.playing) {
                setIsAudioPlaying(true);
            } else {
                setIsAudioPlaying(false);
            }
        }, 300);
        return () => clearInterval(interval);
    }, [ttsPlayer]);

    /** * STOPS THE AI
     * Halts text generation and audio playback.
     */
    const handleStop = () => {
        // 1. Abort text stream request
        if (xhrRef.current) {
            xhrRef.current.abort();
            xhrRef.current = null;
        }

        // 2. Abort audio fetching (if waiting for OpenAI response)
        if (ttsAbortControllerRef.current) {
            ttsAbortControllerRef.current.abort();
            ttsAbortControllerRef.current = null;
        }

        // 3. Pause audio playback (if already playing)
        if (ttsPlayer && ttsPlayer.playing) {
            ttsPlayer.pause();
        }

        // 4. Reset states
        setIsGenerating(false);
        setIsLoading(false);
        setIsAudioPlaying(false);
    };

    /**
     * Sends text to the OpenAI API to generate speech (Text-to-Speech)
     */
    const playChatGptAudio = async (text: string) => {
        // Create a new AbortController for every fetch request
        const abortController = new AbortController();
        ttsAbortControllerRef.current = abortController;

        try {
            setIsLoading(true);
            const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

            if (!apiKey) {
                alert("Missing API Key! Restart Expo with: npx expo start -c");
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
                signal: abortController.signal,
            });

            if (!response.ok) throw new Error(`OpenAI API connection error: ${response.status}`);

            // If stopped while waiting for the HTTP response:
            if (abortController.signal.aborted) return;

            if (Platform.OS === 'web') {
                const blob = await response.blob();
                if (abortController.signal.aborted) return; // Double check abort status

                const url = URL.createObjectURL(blob);
                ttsPlayer.replace(url);
                setIsAudioPlaying(true);
                ttsPlayer.play();
            } else {
                const arrayBuffer = await response.arrayBuffer();
                if (abortController.signal.aborted) return;

                const base64data = Buffer.from(arrayBuffer).toString('base64');
                const fileUri = (FileSystem.documentDirectory || '') + 'chatgpt_response.mp3';

                await FileSystem.writeAsStringAsync(fileUri, base64data, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                // Final check before playing audio
                if (abortController.signal.aborted) return;

                ttsPlayer.replace(fileUri);
                setIsAudioPlaying(true);
                ttsPlayer.play();
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log('OpenAI audio fetch aborted by user.');
                return; // Ignore the error if intentionally aborted
            }
            console.error('ChatGPT TTS playback error:', error);
            alert('Failed to generate audio.');
        } finally {
            setIsLoading(false);
            setIsGenerating(false);

            // Clear reference to avoid memory leaks
            if (ttsAbortControllerRef.current === abortController) {
                ttsAbortControllerRef.current = null;
            }
        }
    };

    /**
     * Sends a user query to the RAG backend, streams the SSE response token by token
     */
    const askAPI = async (question: string) => {
        setIsLoading(true);
        setIsGenerating(true);
        const aiMessageId = Date.now() + Math.random();

        const AUTH_TOKEN = process.env.EXPO_PUBLIC_AUTH_TOKEN || "";

        setMessages((prev) => [
            ...prev,
            { id: aiMessageId, sender: 'ai', text: '' },
        ]);

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

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
        let firstSourceFound = false;

        xhr.onabort = () => {
            setIsLoading(false);
            setIsGenerating(false);
        };

        xhr.onreadystatechange = () => {
            if (xhr.status === 0 && xhr.readyState === 4) return;

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
                            if (!firstSourceFound) {
                                try {
                                    const sourceData = JSON.parse(chunk);
                                    if (sourceData && sourceData.attachment_id) {
                                        setAttachmentId(sourceData.attachment_id);

                                        const rawFileName = sourceData.file_name || 'Dokument.pdf';
                                        const cleanFileName = rawFileName.split('/').pop() || 'Dokument.pdf';
                                        setAttachmentName(cleanFileName);
                                        if (sourceData.page) {
                                            setAttachmentPage(sourceData.page);
                                        }
                                        firstSourceFound = true;
                                    }
                                } catch (e) {
                                    console.error("Source parsing error:", e);
                                }
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
            if (xhr.status === 0) return; // Ignore if aborted
            setIsLoading(false);

            if (xhr.status >= 200 && xhr.status < 300) {
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
                } else {
                    setIsGenerating(false);
                }
            } else {
                handleError(`HTTP Error: ${xhr.status}`);
            }
        };

        xhr.onerror = () => {
            if (xhr.status === 0) return;
            handleError('Server connection error.');
        };
        xhr.ontimeout = () => {
            handleError('Response timeout exceeded.');
        };

        const handleError = (errorDetails: string) => {
            setIsLoading(false);
            setIsGenerating(false);
            const errorMsg = `Sorry, an issue occurred: ${errorDetails}`;
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === aiMessageId && !fullText ? { ...msg, text: errorMsg } : msg
                )
            );
        };

        xhr.send(JSON.stringify({ question: question }));
    };

    /** Handles sending a text question */
    const handleSendText = () => {
        if (inputText.trim().length === 0) return;

        handleStop(); // Stop AI playback/generation before sending a new message

        const userTempId = Date.now();
        setMessages((prev) => [
            ...prev,
            { id: userTempId, sender: 'user', text: inputText.trim(), isSpeaking: false },
        ]);

        askAPI(inputText.trim());

        setInputText('');
        setShowTextInput(false);
    };

    /** Sends the recorded audio file to the Deepgram API */
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

    /** Main microphone button handler. */
    const handleMicPress = async () => {
        handleStop(); // Stop AI playback/generation when user starts speaking

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

    const isBotTyping = isLoading && !messages.some(m => m.sender === 'ai' && m.text === '');

    // AI is considered active if generating text or playing audio
    const isBotActive = isGenerating || isAudioPlaying;

    // --- RENDER MOBILE VIEW ---
    if (isMobile) {
        return (
            <RightPanel
                currentSource={currentSource}
                attachmentId={attachmentId}
                attachmentName={attachmentName}
                attachmentPage={attachmentPage}
                hasAskedQuestion={messages.length > 1}
                currentImage={currentImage}
                isLoading={isLoading}
                selectedPdf={selectedPdf}
                onSelectPdf={(pdf: any) => {
                    setSelectedPdf(pdf);
                    setShowSchema(false);
                }}
                showSchema={showSchema}
                setShowSchema={setShowSchema}
                setCurrentImage={setCurrentImage}
                isListening={isListening}
                onMicPress={handleMicPress}
                soundLevelAnim={soundLevelAnim}
            />
        );
    }

    // --- RENDER TABLET / WEB VIEW ---
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
                isGenerating={isBotActive}
                onStop={handleStop}
            />
            <RightPanel
                currentSource={currentSource}
                attachmentId={attachmentId}
                attachmentName={attachmentName}
                attachmentPage={attachmentPage}
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
                isGenerating={isBotActive}
                onStop={handleStop}
                soundLevelAnim={soundLevelAnim}
            />
        </View>
    );
}
