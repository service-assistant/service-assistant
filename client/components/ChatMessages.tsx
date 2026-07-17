import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
	Animated,
	type LayoutChangeEvent,
	Platform,
	ScrollView,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const PRIMARY_ORANGE = '#FF7A00';

export type ChatMessageSourceReference = {
	sourceAttachmentId: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
	previewImage?: string;
};

export type ChatMessageItem = {
	id: number;
	sender: 'user' | 'ai';
	text: string;
	isSpeaking?: boolean;
	schemaImage?: string;
	schemaImages?: string[];
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
	sourceReferences?: ChatMessageSourceReference[];
	retryQuestion?: string;
};

type ChatMessagesProps<TMessage extends ChatMessageItem> = {
	messages: TMessage[];
	compact?: boolean;
	isListening: boolean;
	soundLevelAnim: Animated.Value;
	onOpenSchema: (imageUrl: string) => void;
	onOpenSource: (source: TMessage | ChatMessageSourceReference) => void;
	onRetryMessage: (message: TMessage) => void;
	isRetryDisabled?: boolean;
	onUserMessageLayout: (message: TMessage, y: number) => void;
	lightMode?: boolean;
};

type AssistantResponseBlock =
	| { type: 'text'; content: string }
	| { type: 'checklist'; items: string[] }
	| { type: 'warning'; content: string }
	| { type: 'next'; content: string };

const getSchemaImageHtml = (imageUrl: string, zoomable = false, lightMode = false) => `
	<!DOCTYPE html>
	<html>
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=${zoomable ? '6.0' : '1.0'}, user-scalable=${zoomable ? 'yes' : 'no'}" />
		<style>
			html, body { width: 100%; height: 100%; margin: 0; padding: 0; background-color: ${lightMode ? '#FFFFFF' : '#000000'}; overflow: ${zoomable ? 'auto' : 'hidden'}; }
			body { display: flex; align-items: center; justify-content: center; }
			img { display: block; width: 100%; height: 100%; object-fit: contain; filter: ${lightMode ? 'none' : 'invert(100%)'}; }
		</style>
	</head>
	<body>
		<img src="${imageUrl}" />
	</body>
	</html>
`;

export const stripResponseDirectivesForSpeech = (text: string) =>
	text
		.replace(/::(checklist|warning|next)\b[ \t]*/gi, '')
		.replace(/^\s*[-*]\s+/gm, '')
		.trim();

export const InvertedSchemaPreview = ({
	imageUrl,
	aspectRatio,
	zoomable = false,
	lightMode = false,
}: {
	imageUrl: string;
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
				src={imageUrl}
				style={{
					display: 'block',
					width: '100%',
					height: zoomable ? '100%' : 'auto',
					objectFit: zoomable ? 'contain' : undefined,
					filter: lightMode ? 'none' : 'invert(100%)',
				}}
				alt='Schemat pomocniczy'
			/>
		) : (
			<WebView
				pointerEvents={zoomable ? 'auto' : 'none'}
				source={{ html: getSchemaImageHtml(imageUrl, zoomable, lightMode) }}
				style={{ flex: 1, backgroundColor: lightMode ? '#FFFFFF' : '#000000' }}
				scrollEnabled={zoomable}
				nestedScrollEnabled={zoomable}
				scalesPageToFit
				setBuiltInZoomControls={zoomable}
				setDisplayZoomControls={false}
				showsHorizontalScrollIndicator={zoomable}
				showsVerticalScrollIndicator={zoomable}
			/>
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

const parseAssistantResponseBlocks = (text: string): AssistantResponseBlock[] => {
	const blocks: AssistantResponseBlock[] = [];
	const normalizedText = text.replace(/\r\n/g, '\n');
	const directivePattern = /::(checklist|warning|next)\b[ \t]*/gi;
	const matches = Array.from(normalizedText.matchAll(directivePattern));

	const pushTypedBlock = (type: AssistantResponseBlock['type'], content: string) => {
		const trimmedContent = content.trim();
		if (!trimmedContent) return;

		if (type === 'checklist') {
			const checklistContent = content.replace(/\s+/g, ' ').trim();
			const itemMarkers = Array.from(checklistContent.matchAll(/[-*]\s+/g));
			const items =
				itemMarkers.length > 0
					? itemMarkers
							.map((match, index) => {
								const itemStart = (match.index ?? 0) + match[0].length;
								const itemEnd =
									index + 1 < itemMarkers.length
										? (itemMarkers[index + 1].index ?? checklistContent.length)
										: checklistContent.length;

								return checklistContent.slice(itemStart, itemEnd).trim();
							})
							.filter(Boolean)
					: content
							.split('\n')
							.map((line) =>
								line
									.trim()
									.replace(/^[-*]\s+/, '')
									.trim(),
							)
							.filter(Boolean);

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
									key={`${item}-${itemIndex}`}
									style={{
										width: '100%',
										flexDirection: 'row',
										alignItems: 'flex-start',
										marginBottom: 12,
									}}>
									<View
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
	isRetryDisabled = false,
	onUserMessageLayout,
	lightMode = false,
}: ChatMessagesProps<TMessage>) {
	return (
		<>
			{messages.map((message) =>
				message.sender === 'user' ? (
					<View
						key={message.id}
						onLayout={(event: LayoutChangeEvent) =>
							onUserMessageLayout(message, event.nativeEvent.layout.y)
						}
						className={
							compact
								? 'self-end bg-[#B85000] rounded-[18px] px-4 py-3 mb-5'
								: 'self-end bg-[#B85000] rounded-full px-7 py-2.5 mb-8'
						}
						style={{ maxWidth: compact ? '88%' : '65%' }}>
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
										: 'text-white text-[18px]'
								}>
								{message.text}
							</Text>
						)}
					</View>
				) : (
					<View
						key={message.id}
						className={compact ? 'self-start mb-5' : 'self-start mb-7'}
						style={
							message.schemaImage ||
							message.schemaImages?.length ||
							message.sourceAttachmentId ||
							message.sourceReferences?.length
								? { width: compact ? '96%' : '78%' }
								: { maxWidth: compact ? '96%' : '78%' }
						}>
						{message.text ? (
							<StructuredAssistantResponse
								text={message.text}
								compact={compact}
								lightMode={lightMode}
							/>
						) : (
							<TypingDotsIndicator color={PRIMARY_ORANGE} />
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
												key={`${schemaImage || source?.sourceAttachmentId || 'material'}-${index}`}
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
					</View>
				),
			)}
		</>
	);
}
