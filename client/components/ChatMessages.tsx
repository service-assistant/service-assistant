import { isInlineMeasurementPointSeparator } from '@/utils/chat-stream';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
	Animated,
	Image,
	type LayoutChangeEvent,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Invert } from './InvertFilter';

const PRIMARY_ORANGE = '#FF7A00';

export type SchemaImageSource = string | { uri: string; headers?: Record<string, string> };

const getSchemaImageUri = (source: SchemaImageSource) =>
	typeof source === 'string' ? source : source.uri;

const getNativeSchemaImageSource = (source: SchemaImageSource) =>
	typeof source === 'string' ? { uri: source } : source;

export type ChatMessageSourceReference = {
	sourceAttachmentId: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
	previewImage?: SchemaImageSource;
};

export type ChatMessageItem = {
	id: number;
	sender: 'user' | 'ai';
	text: string;
	isSpeaking?: boolean;
	schemaImage?: SchemaImageSource;
	schemaImages?: SchemaImageSource[];
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
	sourceReferences?: ChatMessageSourceReference[];
	retryQuestion?: string;
	hasContinuation?: boolean;
};

type ChatMessagesProps<TMessage extends ChatMessageItem> = {
	messages: TMessage[];
	compact?: boolean;
	isListening: boolean;
	soundLevelAnim: Animated.Value;
	onOpenSchema: (imageSource: SchemaImageSource) => void;
	onOpenSource: (source: TMessage | ChatMessageSourceReference) => void;
	onRetryMessage: (message: TMessage) => void;
	onContinueMessage: (message: TMessage) => void;
	isRetryDisabled?: boolean;
	onUserMessageLayout: (message: TMessage, y: number) => void;
	lightMode?: boolean;
};

type AssistantResponseBlock =
	| { type: 'text'; content: string }
	| { type: 'checklist'; items: string[] }
	| { type: 'warning'; content: string }
	| { type: 'next'; content: string };

export const stripResponseDirectivesForSpeech = (text: string) =>
	text
		.replace(/::(checklist|warning|next)(?![a-ząćęłńóśźż0-9_])[ \t]*/g, '')
		.replace(/^\s*[-*]\s+/gm, '')
		.trim();

export const clampSchemaTranslation = (
	translation: number,
	viewportSize: number,
	scale: number,
) => {
	'worklet';
	const limit = (viewportSize * (scale - 1)) / 2;
	return Math.min(limit, Math.max(-limit, translation));
};

export const getFocalSchemaTranslation = (
	startTranslation: number,
	startFocalOffset: number,
	currentFocalOffset: number,
	scaleRatio: number,
) => {
	'worklet';
	return currentFocalOffset - (startFocalOffset - startTranslation) * scaleRatio;
};

const ZoomableSchemaImage = ({
	imageSource,
	lightMode,
}: {
	imageSource: SchemaImageSource;
	lightMode: boolean;
}) => {
	const scale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);
	const viewportWidth = useSharedValue(0);
	const viewportHeight = useSharedValue(0);
	const pinchStartScale = useSharedValue(1);
	const pinchStartTranslateX = useSharedValue(0);
	const pinchStartTranslateY = useSharedValue(0);
	const pinchStartFocalX = useSharedValue(0);
	const pinchStartFocalY = useSharedValue(0);
	const pinchStartDistance = useSharedValue(1);
	const gestureMode = useSharedValue(0); // 0 idle, 1 pan, 2 pinch, 3 wait for all fingers up
	const panStartX = useSharedValue(0);
	const panStartY = useSharedValue(0);
	const panWasActivated = useSharedValue(false);

	const resetTransform = () => {
		'worklet';
		scale.value = 1;
		translateX.value = 0;
		translateY.value = 0;
		savedTranslateX.value = 0;
		savedTranslateY.value = 0;
	};

	const doubleTapGesture = Gesture.Tap()
		.numberOfTaps(2)
		.onEnd((event) => {
			if (scale.value > 1) {
				resetTransform();
			} else {
				const nextTranslateX = clampSchemaTranslation(
					viewportWidth.value / 2 - event.x,
					viewportWidth.value,
					2,
				);
				const nextTranslateY = clampSchemaTranslation(
					viewportHeight.value / 2 - event.y,
					viewportHeight.value,
					2,
				);
				translateX.value = nextTranslateX;
				translateY.value = nextTranslateY;
				savedTranslateX.value = nextTranslateX;
				savedTranslateY.value = nextTranslateY;
				scale.value = 2;
			}
		});
	const transformGesture = Gesture.Manual()
		.onTouchesDown((event, stateManager) => {
			if (gestureMode.value === 0) {
				stateManager.begin();
				gestureMode.value = 1;
				panWasActivated.value = false;
				panStartX.value = event.allTouches[0]?.x ?? 0;
				panStartY.value = event.allTouches[0]?.y ?? 0;
				pinchStartTranslateX.value = translateX.value;
				pinchStartTranslateY.value = translateY.value;
			}

			if (event.numberOfTouches >= 2 && gestureMode.value !== 3) {
				const first = event.allTouches[0];
				const second = event.allTouches[1];
				if (!first || !second) return;
				const distanceX = second.x - first.x;
				const distanceY = second.y - first.y;
				const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
				pinchStartDistance.value = distance >= 20 ? distance : 0;
				pinchStartScale.value = scale.value;
				pinchStartTranslateX.value = translateX.value;
				pinchStartTranslateY.value = translateY.value;
				pinchStartFocalX.value = (first.x + second.x) / 2 - viewportWidth.value / 2;
				pinchStartFocalY.value = (first.y + second.y) / 2 - viewportHeight.value / 2;
				gestureMode.value = 2;
				stateManager.activate();
			}
		})
		.onTouchesMove((event, stateManager) => {
			if (gestureMode.value === 2 && event.numberOfTouches >= 2) {
				const first = event.allTouches[0];
				const second = event.allTouches[1];
				if (!first || !second) return;
				const distanceX = second.x - first.x;
				const distanceY = second.y - first.y;
				const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
				if (distance < 20) return;
				if (pinchStartDistance.value === 0) {
					pinchStartDistance.value = distance;
					pinchStartScale.value = scale.value;
					pinchStartTranslateX.value = translateX.value;
					pinchStartTranslateY.value = translateY.value;
					pinchStartFocalX.value = (first.x + second.x) / 2 - viewportWidth.value / 2;
					pinchStartFocalY.value = (first.y + second.y) / 2 - viewportHeight.value / 2;
					return;
				}
				const nextScale = Math.min(
					6,
					Math.max(1, pinchStartScale.value * (distance / pinchStartDistance.value)),
				);
				const scaleRatio = nextScale / pinchStartScale.value;
				const focalOffsetX = (first.x + second.x) / 2 - viewportWidth.value / 2;
				const focalOffsetY = (first.y + second.y) / 2 - viewportHeight.value / 2;
				scale.value = nextScale;
				translateX.value = clampSchemaTranslation(
					getFocalSchemaTranslation(
						pinchStartTranslateX.value,
						pinchStartFocalX.value,
						focalOffsetX,
						scaleRatio,
					),
					viewportWidth.value,
					nextScale,
				);
				translateY.value = clampSchemaTranslation(
					getFocalSchemaTranslation(
						pinchStartTranslateY.value,
						pinchStartFocalY.value,
						focalOffsetY,
						scaleRatio,
					),
					viewportHeight.value,
					nextScale,
				);
				return;
			}

			if (gestureMode.value === 1 && event.numberOfTouches === 1 && scale.value > 1) {
				const touch = event.allTouches[0];
				if (!touch) return;
				const deltaX = touch.x - panStartX.value;
				const deltaY = touch.y - panStartY.value;
				if (!panWasActivated.value && Math.abs(deltaX) + Math.abs(deltaY) > 3) {
					panWasActivated.value = true;
					stateManager.activate();
				}
				if (panWasActivated.value) {
					translateX.value = clampSchemaTranslation(
						pinchStartTranslateX.value + deltaX,
						viewportWidth.value,
						scale.value,
					);
					translateY.value = clampSchemaTranslation(
						pinchStartTranslateY.value + deltaY,
						viewportHeight.value,
						scale.value,
					);
				}
			}
		})
		.onTouchesUp((event, stateManager) => {
			if (gestureMode.value === 2 && event.numberOfTouches < 2) {
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
				gestureMode.value = 3;
			}
			if (event.numberOfTouches === 0) {
				if (scale.value <= 1.01) resetTransform();
				savedTranslateX.value = translateX.value;
				savedTranslateY.value = translateY.value;
				const handled = gestureMode.value !== 1 || panWasActivated.value;
				gestureMode.value = 0;
				panWasActivated.value = false;
				if (handled) stateManager.end();
				else stateManager.fail();
			}
		})
		.onTouchesCancelled((_event, stateManager) => {
			gestureMode.value = 0;
			panWasActivated.value = false;
			stateManager.fail();
		});
	const gesture = Gesture.Simultaneous(transformGesture, doubleTapGesture);
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));
	const image = (
		<Image
			source={getNativeSchemaImageSource(imageSource)}
			resizeMode='contain'
			style={{ width: '100%', height: '100%' }}
		/>
	);

	return (
		<GestureDetector gesture={gesture}>
			<View
				collapsable={false}
				onLayout={(event) => {
					viewportWidth.value = event.nativeEvent.layout.width;
					viewportHeight.value = event.nativeEvent.layout.height;
				}}
				style={{ flex: 1, overflow: 'hidden' }}
				accessibilityLabel='Powiększony schemat'>
				<Reanimated.View style={[{ flex: 1 }, animatedStyle]}>
					{lightMode ? image : <Invert style={{ flex: 1 }}>{image}</Invert>}
				</Reanimated.View>
			</View>
		</GestureDetector>
	);
};

export const InvertedSchemaPreview = ({
	imageUrl,
	aspectRatio,
	zoomable = false,
	lightMode = false,
}: {
	imageUrl: SchemaImageSource;
	aspectRatio: number;
	zoomable?: boolean;
	lightMode?: boolean;
}) => (
	<View
		style={{
			width: '100%',
			...(zoomable ? { flex: 1 } : { aspectRatio }),
			backgroundColor: lightMode ? '#FFFFFF' : '#000000',
			overflow: 'hidden',
		}}>
		{Platform.OS === 'web' ? (
			<img
				src={getSchemaImageUri(imageUrl)}
				style={{
					display: 'block',
					width: '100%',
					height: zoomable ? '100%' : 'auto',
					objectFit: zoomable ? 'contain' : undefined,
					filter: lightMode ? 'none' : 'invert(100%)',
				}}
				alt='Schemat pomocniczy'
			/>
		) : zoomable ? (
			<ZoomableSchemaImage
				key={getSchemaImageUri(imageUrl)}
				imageSource={imageUrl}
				lightMode={lightMode}
			/>
		) : lightMode ? (
			<Image
				source={getNativeSchemaImageSource(imageUrl)}
				resizeMode='contain'
				style={{ width: '100%', height: '100%' }}
			/>
		) : (
			<Invert style={{ flex: 1 }}>
				<Image
					source={getNativeSchemaImageSource(imageUrl)}
					resizeMode='contain'
					style={{ width: '100%', height: '100%' }}
				/>
			</Invert>
		)}
	</View>
);

const SoundWaveformIndicator = ({ soundLevel }: { soundLevel: Animated.Value }) => {
	const bars = Array.from({ length: 8 }, (_, index) => index);

	return (
		<View className='flex-row items-center justify-center min-h-[20px] gap-[3px]'>
			{bars.map((index) => (
				<Animated.View
					key={index}
					style={{
						width: 3,
						height: 16 - Math.abs(index - 3.5) * 2,
						backgroundColor: '#FFFFFF',
						borderRadius: 1.5,
						transform: [{ scaleY: soundLevel }],
						opacity: soundLevel.interpolate({
							inputRange: [0.2, 1.5],
							outputRange: [0.4, 1],
							extrapolate: 'clamp',
						}),
					}}
				/>
			))}
		</View>
	);
};

const TypingDotsIndicator = ({ color = '#FFFFFF' }: { color?: string }) => {
	const progress = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.timing(progress, {
				toValue: 3,
				duration: 1800,
				useNativeDriver: true,
			}),
		);

		animation.start();
		return () => animation.stop();
	}, [progress]);

	return (
		<View className='flex-row items-center justify-center py-1 gap-1.5'>
			{[0, 1, 2].map((index) => {
				const opacity = progress.interpolate({
					inputRange: [index, index + 0.25, index + 0.75, index + 1, 3],
					outputRange: [0.35, 1, 1, 0.35, 0.35],
					extrapolate: 'clamp',
				});
				const translateY = progress.interpolate({
					inputRange: [index, index + 0.25, index + 0.5, index + 0.75, 3],
					outputRange: [0, -3, -3, 0, 0],
					extrapolate: 'clamp',
				});

				return (
					<Animated.View
						key={index}
						style={{
							width: 6,
							height: 6,
							borderRadius: 3,
							backgroundColor: color,
							opacity,
							transform: [{ translateY }],
						}}
					/>
				);
			})}
		</View>
	);
};

export const parseAssistantResponseBlocks = (text: string): AssistantResponseBlock[] => {
	const blocks: AssistantResponseBlock[] = [];
	const normalizedText = text.replace(/\r\n/g, '\n');
	const directivePattern = /::(checklist|warning|next)(?![a-ząćęłńóśźż0-9_])[ \t]*/g;
	const matches = Array.from(normalizedText.matchAll(directivePattern));

	const pushTypedBlock = (type: AssistantResponseBlock['type'], content: string) => {
		const trimmedContent = content.trim();
		if (!trimmedContent) return;

		if (type === 'checklist') {
			const markers = Array.from(content.matchAll(/(^|\n|[ \t])[-*](?:[ \t]+|$)/g)).filter(
				(marker) => {
					const markerStart = marker.index ?? 0;
					const textBefore = content.slice(0, markerStart);
					const textAfter = content.slice(markerStart + marker[0].length);
					const previousCharacter = textBefore.trimEnd().at(-1) ?? '';
					const nextCharacter = textAfter.trimStart()[0] ?? '';

					// A numeric range such as "54 - 66" is part of an item, not a new item.
					return !(
						(/\d/.test(previousCharacter) && /\d/.test(nextCharacter)) ||
						isInlineMeasurementPointSeparator(textBefore, textAfter)
					);
				},
			);
			const items = markers.map((marker, markerIndex) => {
				const itemStart = (marker.index ?? 0) + marker[0].length;
				const itemEnd =
					markerIndex + 1 < markers.length
						? (markers[markerIndex + 1].index ?? content.length)
						: content.length;

				return content.slice(itemStart, itemEnd).replace(/\s+/g, ' ').trim();
			});

			if (markers.length === 0) {
				items.push(trimmedContent.replace(/^[-*]\s*/, ''));
			}

			if (items.length > 0) {
				blocks.push({ type: 'checklist', items });
			}
		} else {
			blocks.push({ type, content: trimmedContent });
		}
	};

	if (matches.length === 0) {
		pushTypedBlock('text', normalizedText);
		return blocks.length > 0 ? blocks : [{ type: 'text', content: text }];
	}

	const firstMatch = matches[0];
	const firstIndex = firstMatch.index ?? 0;
	pushTypedBlock('text', normalizedText.slice(0, firstIndex));

	matches.forEach((match, index) => {
		const matchIndex = match.index ?? 0;
		const contentStart = matchIndex + match[0].length;
		const contentEnd =
			index + 1 < matches.length
				? (matches[index + 1].index ?? normalizedText.length)
				: normalizedText.length;
		const type = match[1].toLowerCase() as AssistantResponseBlock['type'];

		pushTypedBlock(type, normalizedText.slice(contentStart, contentEnd));
	});

	return blocks.length > 0 ? blocks : [{ type: 'text', content: text }];
};

const StructuredAssistantResponse = ({
	text,
	compact = false,
	lightMode = false,
}: {
	text: string;
	compact?: boolean;
	lightMode?: boolean;
}) => {
	const blocks = parseAssistantResponseBlocks(text);
	const paragraphClassName = compact
		? `${lightMode ? 'text-[#27272A]' : 'text-[#D8DCE2]'} text-[16px] leading-[23px]`
		: `${lightMode ? 'text-[#27272A]' : 'text-[#D7D9DE]'} text-[18px] leading-7`;
	const checklistBoxSize = compact ? 23 : 28;
	const checklistTextStyle = {
		color: lightMode ? '#27272A' : '#F3F4F6',
		fontSize: compact ? 16 : 18,
		lineHeight: compact ? 22 : 25,
		paddingTop: compact ? 2 : 3,
	};

	return (
		<View style={{ width: '100%' }}>
			{blocks.map((block, index) => {
				if (block.type === 'checklist') {
					return (
						<View
							key={`${block.type}-${index}`}
							style={{ width: '100%', marginTop: 12 }}>
							{block.items.map((item, itemIndex) => (
								<View
									key={`${block.type}-${index}-item-${itemIndex}`}
									style={{
										width: '100%',
										flexDirection: 'row',
										alignItems: 'flex-start',
										marginBottom: 12,
									}}>
									<View
										accessible
										accessibilityLabel={item}
										accessibilityRole='checkbox'
										accessibilityState={{ checked: false }}
										style={{
											width: checklistBoxSize,
											height: checklistBoxSize,
											flexShrink: 0,
											marginRight: 12,
											marginTop: 2,
											borderWidth: 1,
											borderColor: PRIMARY_ORANGE,
											borderRadius: 6,
											backgroundColor: 'transparent',
										}}
									/>
									<View style={{ flex: 1, minWidth: 0 }}>
										<Text style={checklistTextStyle}>{item}</Text>
									</View>
								</View>
							))}
						</View>
					);
				}

				if (block.type === 'warning') {
					return (
						<View
							key={`${block.type}-${index}`}
							style={{
								width: '100%',
								flexDirection: 'row',
								alignItems: 'center',
								marginTop: 16,
								paddingHorizontal: 16,
								paddingVertical: 12,
								borderWidth: 1,
								borderColor: '#FF2D55',
								borderRadius: 8,
								backgroundColor: lightMode ? '#FFF1F2' : '#2B050B',
							}}>
							<View style={{ flexShrink: 0 }}>
								<Feather
									name='alert-triangle'
									size={compact ? 21 : 25}
									color='#FF304F'
								/>
							</View>
							<Text
								style={{
									flex: 1,
									minWidth: 0,
									marginLeft: 12,
									color: lightMode ? '#881337' : '#F5F5F5',
									fontSize: compact ? 15 : 18,
									lineHeight: compact ? 21 : 25,
								}}>
								{block.content}
							</Text>
						</View>
					);
				}

				if (block.type === 'next') {
					return (
						<View
							key={`${block.type}-${index}`}
							style={{
								width: '100%',
								flexDirection: 'row',
								alignItems: 'flex-start',
								marginTop: 16,
							}}>
							<View style={{ flexShrink: 0, marginTop: compact ? 1 : 2 }}>
								<Feather
									name='arrow-right'
									size={compact ? 22 : 27}
									color={lightMode ? '#3F3F46' : '#F4F4F5'}
								/>
							</View>
							<Text
								style={{
									flex: 1,
									minWidth: 0,
									marginLeft: 12,
									paddingTop: compact ? 3 : 4,
									color: lightMode ? '#27272A' : '#F4F4F5',
									fontSize: compact ? 16 : 18,
									lineHeight: compact ? 23 : 25,
								}}>
								{block.content}
							</Text>
						</View>
					);
				}

				return (
					<Text
						key={`${block.type}-${index}`}
						className={`${paragraphClassName} ${index > 0 ? 'mt-3' : ''}`}>
						{block.content}
					</Text>
				);
			})}
		</View>
	);
};

export default function ChatMessages<TMessage extends ChatMessageItem>({
	messages,
	compact = false,
	isListening,
	soundLevelAnim,
	onOpenSchema,
	onOpenSource,
	onRetryMessage,
	onContinueMessage,
	isRetryDisabled = false,
	onUserMessageLayout,
	lightMode = false,
}: ChatMessagesProps<TMessage>) {
	return (
		<>
			{messages.map((message, messageIndex) =>
				message.sender === 'user' ? (
					<View
						key={message.id}
						onLayout={(event: LayoutChangeEvent) =>
							onUserMessageLayout(message, event.nativeEvent.layout.y)
						}
						className={
							compact
								? 'self-end bg-[#B85000] rounded-[18px] px-4 py-3 mb-5'
								: 'self-end bg-[#B85000] rounded-[18px] px-6 py-3 mb-8'
						}
						style={{
							maxWidth: compact ? '88%' : '65%',
							minWidth: 0,
							flexShrink: 1,
						}}>
						{message.isSpeaking && !message.text ? (
							isListening ? (
								<SoundWaveformIndicator soundLevel={soundLevelAnim} />
							) : (
								<TypingDotsIndicator />
							)
						) : (
							<Text
								className={
									compact
										? 'text-white text-[17px] leading-[22px]'
										: 'text-white text-[18px] leading-[24px]'
								}
								style={{ flexShrink: 1, minWidth: 0 }}>
								{message.text}
							</Text>
						)}
					</View>
				) : (
					<View
						key={message.id}
						className={compact ? 'self-start mb-5' : 'self-start mb-7'}
						style={
							compact
								? { width: '96%' }
								: message.schemaImage ||
									  message.schemaImages?.length ||
									  message.sourceAttachmentId ||
									  message.sourceReferences?.length
									? { width: '78%' }
									: { maxWidth: '78%' }
						}>
						{message.text ? (
							<StructuredAssistantResponse
								text={message.text}
								compact={compact}
								lightMode={lightMode}
							/>
						) : (
							<View style={{ alignSelf: 'flex-start' }}>
								<TypingDotsIndicator color={PRIMARY_ORANGE} />
							</View>
						)}
						{(() => {
							const schemaImages = (
								message.schemaImages?.length
									? message.schemaImages
									: message.schemaImage
										? [message.schemaImage]
										: []
							).slice(0, 5);
							const sourceReferences = (
								message.sourceReferences?.length
									? message.sourceReferences
									: message.sourceAttachmentId
										? [message as ChatMessageSourceReference]
										: []
							).slice(0, 5);

							if (schemaImages.length === 0 && sourceReferences.length === 0)
								return null;

							const materials = Array.from(
								{
									length: Math.min(
										5,
										Math.max(schemaImages.length, sourceReferences.length),
									),
								},
								(_, index) => {
									const schemaImage = schemaImages[index];
									const source =
										sourceReferences.find(
											(reference) => reference.previewImage === schemaImage,
										) || sourceReferences[index];

									return { schemaImage, source };
								},
							);

							return (
								<View className='mt-4'>
									<Text
										className={`${lightMode ? 'text-[#52525B]' : 'text-[#AEB3BA]'} text-[14px]`}>
										Schematy z dokumentacji
									</Text>
									<Text
										className={`${lightMode ? 'text-[#71717A]' : 'text-[#7F858D]'} text-[12px] mb-2`}>
										Kliknij schemat, aby otworzyć go w pełnym rozmiarze.
									</Text>
									<ScrollView
										horizontal
										showsHorizontalScrollIndicator={false}
										style={{ width: '100%' }}
										contentContainerStyle={
											compact
												? { gap: 8, paddingRight: 4 }
												: { gap: 8, width: '100%' }
										}>
										{materials.map(({ schemaImage, source }, index) => (
											<View
												key={`${schemaImage ? getSchemaImageUri(schemaImage) : source?.sourceAttachmentId || 'material'}-${index}`}
												className={`rounded-lg overflow-hidden border ${
													lightMode
														? 'border-[#D4D4D8] bg-white'
														: 'border-[#292D33] bg-[#111318]'
												}`}
												style={
													compact
														? { width: 136 }
														: { flex: 1, minWidth: 0 }
												}>
												<TouchableOpacity
													onPress={() =>
														schemaImage && onOpenSchema(schemaImage)
													}
													disabled={!schemaImage}
													accessibilityRole='button'
													accessibilityLabel={`Powiększ schemat ${index + 1}`}
													className='items-center justify-center'
													style={{ width: '100%', aspectRatio: 1 }}>
													{schemaImage ? (
														<InvertedSchemaPreview
															imageUrl={schemaImage}
															aspectRatio={1}
															lightMode={lightMode}
														/>
													) : (
														<Feather
															name='file-text'
															size={compact ? 22 : 28}
															color={PRIMARY_ORANGE}
														/>
													)}
												</TouchableOpacity>
												{source ? (
													<TouchableOpacity
														onPress={() => onOpenSource(source)}
														accessibilityRole='button'
														accessibilityLabel={`Otwórz źródło ${index + 1}`}
														className={`flex-row items-center border-t px-2.5 py-2 ${
															lightMode
																? 'border-[#E4E4E7] bg-[#FAFAFA]'
																: 'border-[#292D33] bg-[#111318]'
														}`}
														style={{ minHeight: compact ? 48 : 56 }}>
														<MaterialCommunityIcons
															name='file-pdf-box'
															size={compact ? 18 : 21}
															color='#EF4444'
															style={{
																marginRight: 6,
																flexShrink: 0,
															}}
														/>
														<Text
															className={`${lightMode ? 'text-[#27272A]' : 'text-[#F4F4F5]'} flex-1 font-semibold`}
															style={{
																fontSize: compact ? 12 : 13,
																lineHeight: compact ? 16 : 17,
															}}
															numberOfLines={2}>
															{source.sourceAttachmentName ||
																`Dokument_${source.sourceAttachmentId}.pdf`}
														</Text>
													</TouchableOpacity>
												) : null}
											</View>
										))}
									</ScrollView>
								</View>
							);
						})()}
						{message.retryQuestion ? (
							<TouchableOpacity
								onPress={() => onRetryMessage(message)}
								disabled={isRetryDisabled}
								accessibilityRole='button'
								accessibilityLabel='Wyślij pytanie ponownie'
								className='mt-4 self-start flex-row items-center rounded-lg border border-[#FF7A00] px-4 py-3'
								style={{ opacity: isRetryDisabled ? 0.5 : 1 }}>
								<Feather
									name='refresh-cw'
									size={compact ? 18 : 20}
									color={PRIMARY_ORANGE}
								/>
								<Text className='ml-2 text-[13px] font-bold tracking-wide text-[#FF7A00]'>
									WYŚLIJ PONOWNIE
								</Text>
							</TouchableOpacity>
						) : null}
						{message.hasContinuation && messageIndex === messages.length - 1 ? (
							<TouchableOpacity
								onPress={() => onContinueMessage(message)}
								disabled={isRetryDisabled}
								accessibilityRole='button'
								accessibilityLabel='Wyślij wiadomość Co dalej?'
								className='mt-5 self-start flex-row items-center justify-center'
								style={{
									height: compact ? 42 : 46,
									paddingHorizontal: compact ? 16 : 22,
									borderRadius: compact ? 10 : 12,
									borderWidth: 1.5,
									borderColor: PRIMARY_ORANGE,
									backgroundColor: lightMode
										? '#FFF7ED'
										: 'rgba(255, 122, 0, 0.12)',
									opacity: isRetryDisabled ? 0.5 : 1,
								}}>
								<Feather
									name='arrow-right'
									size={compact ? 17 : 19}
									color={PRIMARY_ORANGE}
								/>
								<Text
									style={{
										marginLeft: 8,
										color: lightMode ? '#C2410C' : PRIMARY_ORANGE,
										fontSize: compact ? 14 : 16,
										lineHeight: compact ? 18 : 21,
										fontWeight: '700',
									}}>
									Co dalej?
								</Text>
							</TouchableOpacity>
						) : null}
					</View>
				),
			)}
		</>
	);
}
