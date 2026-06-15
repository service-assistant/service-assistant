import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
	Animated,
	Image,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	useWindowDimensions,
	View,
	type LayoutChangeEvent,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import ChatMessages, {
	InvertedSchemaPreview,
	type ChatMessageItem,
} from '@/components/ChatMessages';
import ControlPanel from '@/components/ControlPanel';
import SourcePanel from '@/components/SourcePanel';
import StartPromptView, { type KeyboardFrame } from '@/components/StartPromptView';

const PRIMARY_ORANGE = '#FF7A00';

function HeaderLogo({
	uri,
	height,
	maxWidth,
	marginRight = 0,
}: {
	uri: string;
	height: number;
	maxWidth: number;
	marginRight?: number;
}) {
	const [aspectRatio, setAspectRatio] = React.useState(3);

	React.useEffect(() => {
		let cancelled = false;

		Image.getSize(
			uri,
			(width, imageHeight) => {
				if (!cancelled && width > 0 && imageHeight > 0) {
					setAspectRatio(width / imageHeight);
				}
			},
			() => {
				if (!cancelled) setAspectRatio(3);
			},
		);

		return () => {
			cancelled = true;
		};
	}, [uri]);

	return (
		<Image
			source={{ uri }}
			style={{
				width: Math.min(maxWidth, height * aspectRatio),
				height,
				marginRight,
			}}
			resizeMode='contain'
		/>
	);
}

function SlidingHeaderIdentity({
	logoUrl,
	logoHeight,
	logoMaxWidth,
	logoMarginRight,
	text,
	fontSize,
	lineHeight,
}: {
	logoUrl?: string;
	logoHeight: number;
	logoMaxWidth: number;
	logoMarginRight: number;
	text: string;
	fontSize: number;
	lineHeight: number;
}) {
	const slideAnim = React.useRef(new Animated.Value(0)).current;
	const [containerWidth, setContainerWidth] = React.useState(0);
	const [contentWidth, setContentWidth] = React.useState(0);
	const [isSliding, setIsSliding] = React.useState(false);
	const overflow = Math.max(0, contentWidth - containerWidth);
	const canSlide = overflow > 2;

	React.useEffect(() => {
		if (!isSliding || !canSlide) {
			slideAnim.stopAnimation();
			slideAnim.setValue(0);
			return;
		}

		slideAnim.setValue(0);
		const animation = Animated.loop(
			Animated.sequence([
				Animated.delay(250),
				Animated.timing(slideAnim, {
					toValue: -overflow,
					duration: Math.max(1600, overflow * 32),
					useNativeDriver: true,
				}),
				Animated.delay(450),
				Animated.timing(slideAnim, {
					toValue: 0,
					duration: 350,
					useNativeDriver: true,
				}),
			]),
		);

		animation.start();

		return () => {
			animation.stop();
			slideAnim.setValue(0);
		};
	}, [canSlide, isSliding, overflow, slideAnim]);

	const textStyle = {
		color: '#FFFFFF',
		fontWeight: '700' as const,
		letterSpacing: 0,
		fontSize,
		lineHeight,
	};

	const handleContainerLayout = (event: LayoutChangeEvent) => {
		setContainerWidth(event.nativeEvent.layout.width);
	};

	const handleContentLayout = (event: LayoutChangeEvent) => {
		setContentWidth(event.nativeEvent.layout.width);
	};

	const startSliding = () => {
		if (canSlide) {
			setIsSliding(true);
		}
	};

	const renderIdentityRow = (measuring = false) => (
		<View
			className='flex-row items-center'
			style={{
				flexShrink: measuring || isSliding ? 0 : 1,
				maxWidth: measuring || isSliding ? undefined : '100%',
			}}>
			{logoUrl ? (
				<HeaderLogo
					uri={logoUrl}
					height={logoHeight}
					maxWidth={logoMaxWidth}
					marginRight={logoMarginRight}
				/>
			) : null}
			<Text
				style={[
					textStyle,
					{
						flexShrink: measuring || isSliding ? 0 : 1,
						minWidth: 0,
					},
				]}
				numberOfLines={1}
				ellipsizeMode={isSliding ? 'clip' : 'tail'}>
				{text}
			</Text>
		</View>
	);

	return (
		<TouchableOpacity
			activeOpacity={1}
			delayLongPress={250}
			onLongPress={startSliding}
			onPressOut={() => setIsSliding(false)}
			style={{ flexShrink: 1, minWidth: 0, maxWidth: '100%' }}>
			<View
				onLayout={handleContainerLayout}
				style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
				<Animated.View
					style={[
						canSlide && isSliding ? { width: contentWidth } : null,
						{ transform: [{ translateX: slideAnim }] },
					]}>
					{renderIdentityRow(false)}
				</Animated.View>
			</View>
			<View
				pointerEvents='none'
				onLayout={handleContentLayout}
				style={[
					{
						position: 'absolute',
						opacity: 0,
						left: -10000,
						top: 0,
					},
				]}>
				{renderIdentityRow(true)}
			</View>
		</TouchableOpacity>
	);
}

function FloatingChatInput({
	compact = false,
	inputText,
	onChangeText,
	onSend,
	autoFocus = false,
}: {
	compact?: boolean;
	inputText: string;
	onChangeText: (text: string) => void;
	onSend: () => void;
	autoFocus?: boolean;
}) {
	return (
		<View
			className='flex-row items-center'
			style={{
				width: '100%',
				height: compact ? 56 : 68,
				borderRadius: compact ? 28 : 34,
				backgroundColor: '#242424',
				paddingLeft: compact ? 18 : 32,
				paddingRight: compact ? 7 : 10,
			}}>
			<TextInput
				className='flex-1 text-white'
				placeholder='Np. nie działa podnoszenie wideł'
				placeholderTextColor='#A1A1AA'
				value={inputText}
				onChangeText={onChangeText}
				onSubmitEditing={onSend}
				style={{
					fontSize: compact ? 16 : 20,
					lineHeight: compact ? 22 : 27,
				}}
				autoFocus={autoFocus}
			/>
			<TouchableOpacity
				onPress={onSend}
				className='items-center justify-center'
				style={{
					width: compact ? 44 : 54,
					height: compact ? 44 : 54,
					borderRadius: compact ? 22 : 27,
					backgroundColor: '#1E2028',
					borderWidth: 1,
					borderColor: 'rgba(255, 122, 0, 0.5)',
				}}>
				<Feather name='arrow-up-right' size={compact ? 24 : 30} color={PRIMARY_ORANGE} />
			</TouchableOpacity>
		</View>
	);
}

type TextInputRef = React.RefObject<TextInput | null>;
type ScrollViewRef = React.RefObject<ScrollView | null>;
type SourcePanelProps = React.ComponentProps<typeof SourcePanel>;

type SharedLayoutProps<TMessage extends ChatMessageItem> = {
	currentSource: string;
	logoUrl?: string;
	isTablet: boolean;
	height: number;
	keyboardFrame: KeyboardFrame | null;
	hasStartedChat: boolean;
	showTextInput: boolean;
	inputText: string;
	messages: TMessage[];
	shouldFocusStartPromptInput: boolean;
	isListening: boolean;
	isMicProcessing: boolean;
	isMicRestartBlocked: boolean;
	isSpeechInputUnavailable?: boolean;
	isVoiceOutputUnavailable?: boolean;
	soundLevelAnim: Animated.Value;
	currentImageAspectRatio: number;
	startPromptInputRef: TextInputRef;
	messagesScrollViewRef: ScrollViewRef;
	sourcePanelProps: SourcePanelProps;
	sourcePanelFullScreen: boolean;
	onBack: () => void;
	onOpenMachineInfo: () => void;
	onOpenFilesPanel: () => void;
	onSendText: () => void;
	onChangeText: (text: string) => void;
	onShowTextInputChange: (visible: boolean) => void;
	onShouldFocusStartPromptInputChange: (shouldFocus: boolean) => void;
	onOpenSchema: (imageUrl: string) => void;
	onOpenSource: (message: TMessage) => void;
	onMicPress: () => void;
	onWritingPress: () => void;
};

type FullscreenSchemaViewProps = {
	imageUrl: string;
	aspectRatio: number;
	insets: EdgeInsets;
	onBack: () => void;
};

export function FullscreenSchemaView({
	imageUrl,
	aspectRatio,
	insets,
	onBack,
}: FullscreenSchemaViewProps) {
	const { width, height } = useWindowDimensions();
	const isTablet = Math.min(width, height) >= 600;
	const usePhoneBackIconOnly = !isTablet;
	const backButtonHeight = isTablet ? 44 : 48;

	return (
		<View className='flex-1 bg-black px-4 pt-4'>
			<View className='h-14 flex-row items-center'>
				<TouchableOpacity
					onPress={onBack}
					accessibilityRole='button'
					accessibilityLabel='Wstecz'
					className='flex-row items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#0D0D0D]'
					style={{
						height: backButtonHeight,
						width: usePhoneBackIconOnly ? backButtonHeight : undefined,
						paddingHorizontal: usePhoneBackIconOnly ? 0 : 18,
					}}>
					<Feather name='arrow-left' size={22} color={PRIMARY_ORANGE} />
					{usePhoneBackIconOnly ? null : (
						<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
							WSTECZ
						</Text>
					)}
				</TouchableOpacity>
			</View>
			<View
				className='flex-1 mt-4 bg-black'
				style={{ marginBottom: Math.max(insets.bottom, 20) }}>
				<InvertedSchemaPreview imageUrl={imageUrl} aspectRatio={aspectRatio} zoomable />
			</View>
		</View>
	);
}

export function PortraitChatLayout<TMessage extends ChatMessageItem>({
	currentSource,
	logoUrl,
	isTablet,
	height,
	keyboardFrame,
	hasStartedChat,
	showTextInput,
	inputText,
	messages,
	shouldFocusStartPromptInput,
	isListening,
	isMicProcessing,
	isMicRestartBlocked,
	isSpeechInputUnavailable,
	isVoiceOutputUnavailable,
	soundLevelAnim,
	currentImageAspectRatio,
	startPromptInputRef,
	messagesScrollViewRef,
	sourcePanelProps,
	sourcePanelFullScreen,
	onBack,
	onOpenFilesPanel,
	onSendText,
	onChangeText,
	onShowTextInputChange,
	onShouldFocusStartPromptInputChange,
	onOpenSchema,
	onOpenSource,
	onMicPress,
	onWritingPress,
	insets,
}: SharedLayoutProps<TMessage> & { insets: EdgeInsets }) {
	const isPhonePortrait = !isTablet;
	const portraitPanelHeight = isPhonePortrait ? 162 : 140;
	const portraitControlsBottom = isPhonePortrait
		? 0
		: insets.bottom > 0
			? insets.bottom + 14
			: 24;
	const portraitControlsHeight = portraitPanelHeight;
	const headerSafeTop = isPhonePortrait ? insets.top : 0;
	const headerHeight = isPhonePortrait ? 64 + headerSafeTop : 76;
	const headerButtonSize = isPhonePortrait ? 42 : 48;
	const headerIconSize = isPhonePortrait ? 21 : 23;
	const headerLogoHeight = isPhonePortrait ? 15 : 20;
	const headerLogoMaxWidth = isPhonePortrait ? 110 : 120;
	const headerTitleFontSize = isPhonePortrait ? 16 : 20;
	const keyboardOverlap = keyboardFrame ? Math.max(0, height - keyboardFrame.screenY) : 0;
	const portraitInputBottom = keyboardFrame
		? keyboardOverlap + 8
		: portraitControlsBottom + portraitControlsHeight + 12;
	const portraitMessagesBottomPadding = Math.max(
		portraitControlsHeight + 54,
		portraitInputBottom + (showTextInput ? 70 : 0),
	);

	return (
		<View className='flex-1 bg-[#080808]'>
			<View
				className='px-4 flex-row items-center border-b border-[#1F1F1F] bg-[#0D0D0D] shadow-2xl z-10'
				style={{
					height: headerHeight,
					paddingTop: headerSafeTop,
				}}>
				<TouchableOpacity
					onPress={onBack}
					className='items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#0D0D0D]'
					style={{ width: headerButtonSize, height: headerButtonSize, flexShrink: 0 }}>
					<Feather name='arrow-left' size={headerIconSize} color={PRIMARY_ORANGE} />
				</TouchableOpacity>

				<View
					className='px-2 min-w-0'
					style={{
						flex: 1,
						flexShrink: 1,
						alignItems: 'center',
						justifyContent: 'center',
					}}>
					<View
						className='flex-row items-center min-w-0'
						style={{ maxWidth: '100%', flexShrink: 1 }}>
						<SlidingHeaderIdentity
							logoUrl={logoUrl}
							logoHeight={headerLogoHeight}
							logoMaxWidth={headerLogoMaxWidth}
							logoMarginRight={isPhonePortrait ? 6 : 10}
							text={currentSource}
							fontSize={headerTitleFontSize}
							lineHeight={headerTitleFontSize + 5}
						/>
					</View>
				</View>

				<View
					className={`flex-row items-center ${isPhonePortrait ? 'gap-1.5' : 'gap-2'}`}
					style={{ flexShrink: 0 }}>
					<TouchableOpacity
						disabled
						className='items-center justify-center border border-[#242424] rounded-[10px] bg-[#0C0C0C] opacity-50'
						style={{ width: headerButtonSize, height: headerButtonSize }}>
						<Image
							source={require('../assets/images/info.png')}
							style={{
								width: isPhonePortrait ? 19 : 21,
								height: isPhonePortrait ? 19 : 21,
								tintColor: '#6B7280',
							}}
							resizeMode='contain'
						/>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={onOpenFilesPanel}
						className='items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#111111]'
						style={{ width: headerButtonSize, height: headerButtonSize }}>
						<Feather
							name='link'
							size={isPhonePortrait ? 20 : 22}
							color={PRIMARY_ORANGE}
						/>
					</TouchableOpacity>
				</View>
			</View>

			{hasStartedChat ? (
				<ScrollView
					ref={messagesScrollViewRef}
					className='flex-1 mt-5 px-4'
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: portraitMessagesBottomPadding }}>
					<ChatMessages
						messages={messages}
						compact
						isListening={isListening}
						soundLevelAnim={soundLevelAnim}
						schemaAspectRatio={currentImageAspectRatio}
						onOpenSchema={onOpenSchema}
						onOpenSource={onOpenSource}
					/>
				</ScrollView>
			) : (
				<StartPromptView
					compact
					height={height}
					keyboardFrame={keyboardFrame}
					inputText={inputText}
					inputRef={startPromptInputRef}
					hasStartedChat={hasStartedChat}
					shouldFocusInput={shouldFocusStartPromptInput}
					onChangeText={onChangeText}
					onSend={onSendText}
					onShowTextInputChange={onShowTextInputChange}
					onShouldFocusStartPromptInputChange={onShouldFocusStartPromptInputChange}
				/>
			)}

			{showTextInput && hasStartedChat ? (
				<View className='absolute left-4 right-4' style={{ bottom: portraitInputBottom }}>
					<FloatingChatInput
						compact
						inputText={inputText}
						onChangeText={onChangeText}
						onSend={onSendText}
						autoFocus
					/>
				</View>
			) : null}

			<View
				className={`absolute left-0 right-0 ${isPhonePortrait ? '' : 'items-center'}`}
				style={{ bottom: portraitControlsBottom }}>
				<ControlPanel
					orientation='horizontal'
					edgeToEdge={isPhonePortrait}
					isListening={isListening}
					isMicProcessing={isMicProcessing}
					isMicRestartBlocked={isMicRestartBlocked}
					isSpeechInputUnavailable={isSpeechInputUnavailable}
					isVoiceOutputUnavailable={isVoiceOutputUnavailable}
					isWritingActive={showTextInput}
					onMicPress={onMicPress}
					onWritingPress={onWritingPress}
				/>
			</View>
			<SourcePanel {...sourcePanelProps} fullScreen={sourcePanelFullScreen} />
		</View>
	);
}

export function DesktopChatLayout<TMessage extends ChatMessageItem>({
	currentSource,
	logoUrl,
	height,
	keyboardFrame,
	hasStartedChat,
	showTextInput,
	inputText,
	messages,
	shouldFocusStartPromptInput,
	isListening,
	isMicProcessing,
	isMicRestartBlocked,
	isSpeechInputUnavailable,
	isVoiceOutputUnavailable,
	soundLevelAnim,
	currentImageAspectRatio,
	startPromptInputRef,
	messagesScrollViewRef,
	sourcePanelProps,
	sourcePanelFullScreen,
	onBack,
	onOpenFilesPanel,
	onSendText,
	onChangeText,
	onShowTextInputChange,
	onShouldFocusStartPromptInputChange,
	onOpenSchema,
	onOpenSource,
	onMicPress,
	onWritingPress,
}: SharedLayoutProps<TMessage>) {
	const keyboardOverlap = keyboardFrame ? Math.max(0, height - keyboardFrame.screenY) : 0;

	return (
		<View className='flex-1 bg-[#080808]'>
			<View className='h-[76px] px-6 flex-row items-center border-b border-[#1F1F1F] bg-[#0D0D0D] shadow-2xl z-10'>
				<TouchableOpacity
					onPress={onBack}
					className='h-12 px-[18px] flex-row items-center justify-center mr-8 border border-[#2A2A2A] rounded-[10px] bg-[#0D0D0D]'>
					<Feather name='arrow-left' size={22} color='#FF7A00' />
					<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
						WSTECZ
					</Text>
				</TouchableOpacity>

				{logoUrl ? <HeaderLogo uri={logoUrl} height={20} maxWidth={136} /> : null}
				<Text className='text-white text-[20px] font-bold ml-5 tracking-wider'>
					{currentSource}
				</Text>

				<View className='flex-1' />

				<TouchableOpacity
					disabled
					className='h-12 px-[18px] flex-row items-center justify-center mr-7 border border-[#242424] rounded-[10px] bg-[#0C0C0C] opacity-50'>
					<Image
						source={require('../assets/images/info.png')}
						style={{ width: 21, height: 21, tintColor: '#6B7280' }}
						resizeMode='contain'
					/>
					<Text className='text-[#9CA3AF] ml-4 text-[13px] font-semibold tracking-wider'>
						O MASZYNIE
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					onPress={onOpenFilesPanel}
					className='h-12 px-[18px] flex-row items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#111111]'>
					<Feather name='link' size={21} color='#FF7A00' />
					<Text className='text-[#E6E6E6] ml-4 text-[13px] font-semibold tracking-wider'>
						WSZYSTKIE PLIKI
					</Text>
				</TouchableOpacity>
			</View>

			<View className='flex-1 flex-row px-6 py-5'>
				{hasStartedChat ? (
					<ScrollView
						ref={messagesScrollViewRef}
						className='flex-1 pr-8'
						contentContainerStyle={{ paddingBottom: 30 }}>
						<ChatMessages
							messages={messages}
							isListening={isListening}
							soundLevelAnim={soundLevelAnim}
							schemaAspectRatio={currentImageAspectRatio}
							onOpenSchema={onOpenSchema}
							onOpenSource={onOpenSource}
						/>
					</ScrollView>
				) : (
					<StartPromptView
						height={height}
						keyboardFrame={keyboardFrame}
						inputText={inputText}
						inputRef={startPromptInputRef}
						hasStartedChat={hasStartedChat}
						shouldFocusInput={shouldFocusStartPromptInput}
						onChangeText={onChangeText}
						onSend={onSendText}
						onShowTextInputChange={onShowTextInputChange}
						onShouldFocusStartPromptInputChange={onShouldFocusStartPromptInputChange}
					/>
				)}

				<View className='relative self-center ml-5'>
					<ControlPanel
						orientation='vertical'
						isListening={isListening}
						isMicProcessing={isMicProcessing}
						isMicRestartBlocked={isMicRestartBlocked}
						isSpeechInputUnavailable={isSpeechInputUnavailable}
						isVoiceOutputUnavailable={isVoiceOutputUnavailable}
						isWritingActive={showTextInput}
						onMicPress={onMicPress}
						onWritingPress={onWritingPress}
					/>
				</View>
			</View>

			{showTextInput && hasStartedChat ? (
				<View
					className='absolute left-6 right-[245px]'
					style={{ bottom: keyboardFrame ? keyboardOverlap + 8 : 24 }}>
					<FloatingChatInput
						inputText={inputText}
						onChangeText={onChangeText}
						onSend={onSendText}
						autoFocus
					/>
				</View>
			) : null}
			<SourcePanel {...sourcePanelProps} fullScreen={sourcePanelFullScreen} />
		</View>
	);
}
