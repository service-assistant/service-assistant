import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

const PRIMARY_ORANGE = '#FF7A00';

export type ChatMessageItem = {
	id: number;
	sender: 'user' | 'ai';
	text: string;
	isSpeaking?: boolean;
	schemaImage?: string;
	sourceAttachmentId?: number;
	sourceAttachmentName?: string;
	sourceAttachmentPage?: number;
};

type ChatMessagesProps<TMessage extends ChatMessageItem> = {
	messages: TMessage[];
	compact?: boolean;
	isListening: boolean;
	soundLevelAnim: Animated.Value;
	schemaAspectRatio: number;
	onOpenSchema: (imageUrl: string) => void;
	onOpenSource: (message: TMessage) => void;
};

type AssistantResponseBlock =
	| { type: 'text'; content: string }
	| { type: 'checklist'; items: string[] }
	| { type: 'warning'; content: string }
	| { type: 'next'; content: string };

const getInvertedImageHtml = (imageUrl: string, zoomable = false) => `
	<!DOCTYPE html>
	<html>
	<head>
		<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=${zoomable ? '6.0' : '1.0'}, user-scalable=${zoomable ? 'yes' : 'no'}" />
		<style>
			html, body { width: 100%; height: 100%; margin: 0; padding: 0; background-color: #000000; overflow: ${zoomable ? 'auto' : 'hidden'}; }
			body { display: flex; align-items: center; justify-content: center; }
			img { display: block; width: 100%; height: 100%; object-fit: contain; filter: invert(100%); }
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
}: {
	imageUrl: string;
	aspectRatio: number;
	zoomable?: boolean;
}) => (
	<View
		style={{
			width: '100%',
			...(zoomable ? { flex: 1 } : { aspectRatio }),
			backgroundColor: '#000000',
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
					filter: 'invert(100%)',
				}}
				alt='Schemat pomocniczy'
			/>
		) : (
			<WebView
				pointerEvents={zoomable ? 'auto' : 'none'}
				source={{ html: getInvertedImageHtml(imageUrl, zoomable) }}
				style={{ flex: 1, backgroundColor: '#000000' }}
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
}: {
	text: string;
	compact?: boolean;
}) => {
	const blocks = parseAssistantResponseBlocks(text);
	const paragraphClassName = compact
		? 'text-[#D8DCE2] text-[16px] leading-[23px]'
		: 'text-[#D7D9DE] text-[18px] leading-7';
	const checklistBoxSize = compact ? 23 : 28;
	const checklistTextStyle = {
		color: '#F3F4F6',
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
								backgroundColor: '#2B050B',
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
									color: '#F5F5F5',
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
									color='#F4F4F5'
								/>
							</View>
							<Text
								style={{
									flex: 1,
									minWidth: 0,
									marginLeft: 12,
									paddingTop: compact ? 3 : 4,
									color: '#F4F4F5',
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
	schemaAspectRatio,
	onOpenSchema,
	onOpenSource,
}: ChatMessagesProps<TMessage>) {
	return (
		<>
			{messages.map((message) =>
				message.sender === 'user' ? (
					<View
						key={message.id}
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
						style={{ maxWidth: compact ? '96%' : '78%' }}>
						{message.text ? (
							<StructuredAssistantResponse text={message.text} compact={compact} />
						) : (
							<TypingDotsIndicator color={PRIMARY_ORANGE} />
						)}
						{message.schemaImage ? (
							<TouchableOpacity
								onPress={() => onOpenSchema(message.schemaImage || '')}
								className='rounded-xl overflow-hidden border border-[#292D33] bg-[#111318] mt-4'
								style={compact ? { maxWidth: 610 } : { width: 410 }}>
								<Text className='text-[#AEB3BA] text-[14px] px-3 py-2 bg-[#111318]'>
									Schemat pomocniczy
								</Text>
								<InvertedSchemaPreview
									imageUrl={message.schemaImage}
									aspectRatio={schemaAspectRatio}
								/>
								<Text className='text-[#AEB3BA] text-[14px] px-3 py-2.5 bg-[#111318]'>
									Naciśnij, aby powiększyć
								</Text>
							</TouchableOpacity>
						) : null}
						{message.sourceAttachmentId ? (
							<TouchableOpacity
								onPress={() => onOpenSource(message)}
								className='self-start flex-row items-center mt-4'>
								<Feather
									name='arrow-up-right'
									size={compact ? 21 : 23}
									color={PRIMARY_ORANGE}
								/>
								<Text
									className={`text-[#FF7A00] ml-2 tracking-wide ${
										compact ? 'text-[12px]' : 'text-[13px]'
									}`}>
									POKAŻ ŹRÓDŁO ODPOWIEDZI
								</Text>
							</TouchableOpacity>
						) : null}
					</View>
				),
			)}
		</>
	);
}
