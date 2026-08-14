import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
	Animated,
	Dimensions,
	Image,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	type LayoutChangeEvent,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { getPortraitChatHeaderMetrics } from '@/components/chat-header-metrics';
import ChatMessages, {
	InvertedSchemaPreview,
	type ChatMessageItem,
	type ChatMessageSourceReference,
	type SchemaImageSource,
} from '@/components/ChatMessages';
import ComposerPhotoPreview from '@/components/ComposerPhotoPreview';
import ControlPanel from '@/components/ControlPanel';
import MachineInfoPanel from '@/components/MachineInfoPanel';
import SourcePanel from '@/components/SourcePanel';
import StartPromptView, { type KeyboardFrame } from '@/components/StartPromptView';
import ThemeAwareLogo from '@/components/ThemeAwareLogo';
import { MAX_CHAT_PHOTOS } from '@/types/chat';

const PRIMARY_ORANGE = '#FF7A00';
const KEYBOARD_INPUT_GAP = 12;

function ChatBackgroundTexture({ lightMode }: { lightMode: boolean }) {
	if (!lightMode) return null;

	return (
		<Image
			testID='chat-background-texture'
			source={require('../assets/images/chat-premium-grain.png')}
			resizeMode='cover'
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				width: '100%',
				height: '100%',
				opacity: 0.32,
			}}
		/>
	);
}

function HeaderLogo({
	uri,
	height,
	maxWidth,
	marginRight = 0,
	lightMode = false,
}: {
	uri: string;
	height: number;
	maxWidth: number;
	marginRight?: number;
	lightMode?: boolean;
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
		<ThemeAwareLogo
			source={{ uri }}
			width={Math.min(maxWidth, height * aspectRatio)}
			height={height}
			lightMode={lightMode}
			containerStyle={{ marginRight }}
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
	lightMode,
	onPress,
}: {
	logoUrl?: string;
	logoHeight: number;
	logoMaxWidth: number;
	logoMarginRight: number;
	text: string;
	fontSize: number;
	lineHeight: number;
	lightMode: boolean;
	onPress: () => void;
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
		color: lightMode ? '#18181B' : '#FFFFFF',
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
					lightMode={lightMode}
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
			onPress={onPress}
			accessibilityRole='button'
			accessibilityLabel='Informacje o maszynie'
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
	pendingPhotoUris = [],
	onRemovePendingPhoto,
	lightMode = false,
}: {
	compact?: boolean;
	inputText: string;
	onChangeText: (text: string) => void;
	onSend: () => void;
	autoFocus?: boolean;
	pendingPhotoUris?: string[];
	onRemovePendingPhoto?: (photoUri: string) => void;
	lightMode?: boolean;
}) {
	const inputRef = React.useRef<TextInput>(null);
	const hasPendingPhotos = pendingPhotoUris.length > 0;

	return (
		<View collapsable={false}>
			<Pressable
				onPress={() => inputRef.current?.focus()}
				hitSlop={{ top: 12, right: 8, bottom: 12, left: 8 }}
				accessible={false}
				style={{
					width: '100%',
					borderRadius: hasPendingPhotos ? (compact ? 24 : 28) : compact ? 31 : 37,
					backgroundColor: lightMode ? '#FFFFFF' : '#242424',
					borderWidth: 1,
					borderColor: lightMode ? 'rgba(20, 20, 20, 0.09)' : 'rgba(255, 255, 255, 0.08)',
					shadowColor: '#141414',
					shadowOffset: { width: 0, height: 8 },
					shadowOpacity: lightMode ? 0.04 : 0.14,
					shadowRadius: 24,
					elevation: 0,
				}}>
				{hasPendingPhotos && onRemovePendingPhoto ? (
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{
							gap: 10,
							paddingTop: compact ? 12 : 14,
							paddingHorizontal: compact ? 12 : 16,
						}}>
						{pendingPhotoUris.map((photoUri) => (
							<ComposerPhotoPreview
								key={photoUri}
								photoUri={photoUri}
								onRemove={() => onRemovePendingPhoto(photoUri)}
								size={compact ? 96 : 112}
							/>
						))}
					</ScrollView>
				) : null}
				<View
					className='flex-row items-center'
					style={{
						minHeight: compact ? 62 : 74,
						paddingLeft: compact ? 18 : 32,
						paddingRight: compact ? 8 : 10,
					}}>
					<TextInput
						ref={inputRef}
						className={`flex-1 ${lightMode ? 'text-[#18181B]' : 'text-white'}`}
						placeholder='Np. nie działa podnoszenie wideł'
						placeholderTextColor={lightMode ? '#71717A' : '#A1A1AA'}
						value={inputText}
						onChangeText={onChangeText}
						onSubmitEditing={onSend}
						style={{
							height: '100%',
							fontSize: compact ? 16 : 20,
							lineHeight: compact ? 22 : 27,
							paddingVertical: 0,
							textAlignVertical: 'center',
						}}
						autoFocus={autoFocus}
					/>
					<TouchableOpacity
						onPress={onSend}
						className='items-center justify-center'
						style={{
							width: compact ? 46 : 56,
							height: compact ? 46 : 56,
							borderRadius: compact ? 23 : 28,
							backgroundColor: PRIMARY_ORANGE,
							shadowColor: PRIMARY_ORANGE,
							shadowOffset: { width: 0, height: 4 },
							shadowOpacity: 0.2,
							shadowRadius: 8,
							elevation: 3,
						}}>
						<Feather name='arrow-up-right' size={compact ? 24 : 30} color='#FFFFFF' />
					</TouchableOpacity>
				</View>
			</Pressable>
		</View>
	);
}

type TextInputRef = React.RefObject<TextInput | null>;
type ScrollViewRef = React.RefObject<ScrollView | null>;
type SourcePanelProps = React.ComponentProps<typeof SourcePanel>;
type MachineInfoPanelProps = React.ComponentProps<typeof MachineInfoPanel>;

type SharedLayoutProps<TMessage extends ChatMessageItem> = {
	lightMode?: boolean;
	currentSource: string;
	logoUrl?: string;
	isTablet: boolean;
	height: number;
	keyboardFrame: KeyboardFrame | null;
	hasStartedChat: boolean;
	showTextInput: boolean;
	inputText: string;
	messages: TMessage[];
	reserveMessageScrollSpace: boolean;
	shouldFocusStartPromptInput: boolean;
	isListening: boolean;
	isMicStarting: boolean;
	isMicProcessing: boolean;
	isMicRestartBlocked: boolean;
	isSpeechInputUnavailable?: boolean;
	isVoiceOutputUnavailable?: boolean;
	soundLevelAnim: Animated.Value;
	currentImageAspectRatio: number;
	startPromptInputRef: TextInputRef;
	messagesScrollViewRef: ScrollViewRef;
	sourcePanelProps: SourcePanelProps;
	machineInfoPanelProps: MachineInfoPanelProps;
	sourcePanelFullScreen: boolean;
	onBack: () => void;
	onOpenMachineInfo: () => void;
	onOpenFilesPanel: () => void;
	onSendText: () => void;
	onChangeText: (text: string) => void;
	onShowTextInputChange: (visible: boolean) => void;
	onShouldFocusStartPromptInputChange: (shouldFocus: boolean) => void;
	onOpenSchema: (imageSource: SchemaImageSource, title?: string) => void;
	onOpenSource: (source: TMessage | ChatMessageSourceReference) => void;
	onRetryMessage: (message: TMessage) => void;
	onContinueMessage: (message: TMessage) => void;
	isRetryDisabled?: boolean;
	onUserMessageLayout: (message: TMessage, y: number) => void;
	pendingPhotoUris: string[];
	onRemovePendingPhoto: (photoUri: string) => void;
	onMicPress: () => void;
	onCameraPress: () => void;
	onWritingPress: () => void;
};

type FullscreenSchemaViewProps = {
	lightMode?: boolean;
	imageUrl: SchemaImageSource;
	title?: string;
	aspectRatio: number;
	insets: EdgeInsets;
	isTablet?: boolean;
	onBack: () => void;
};

export function FullscreenSchemaView({
	lightMode = false,
	imageUrl,
	title = 'SCHEMAT POMOCNICZY',
	aspectRatio,
	insets,
	isTablet = false,
	onBack,
}: FullscreenSchemaViewProps) {
	const headerMetrics = getPortraitChatHeaderMetrics({
		isTablet,
		topInset: insets.top,
	});

	return (
		<View className={`flex-1 ${lightMode ? 'bg-[#F7F7F8]' : 'bg-black'}`}>
			<View
				className={`flex-row items-center px-4 border-b ${
					lightMode ? 'bg-white border-[#E4E4E7]' : 'bg-[#0D0D0D] border-[#1F1F1F]'
				}`}
				style={{
					height: headerMetrics.height,
					paddingTop: headerMetrics.paddingTop,
				}}>
				<TouchableOpacity
					onPress={onBack}
					accessibilityRole='button'
					accessibilityLabel='Wstecz'
					className={`flex-row items-center justify-center border rounded-[10px] ${
						lightMode ? 'border-[#E4E4E7] bg-white' : 'border-[#2A2A2A] bg-[#0D0D0D]'
					}`}
					style={{
						height: headerMetrics.buttonSize,
						width: headerMetrics.buttonSize,
					}}>
					<Feather
						name='arrow-left'
						size={headerMetrics.iconSize}
						color={PRIMARY_ORANGE}
					/>
				</TouchableOpacity>
				<Text
					className={`flex-1 text-center font-bold ${lightMode ? 'text-[#18181B]' : 'text-white'}`}
					style={{
						fontSize: headerMetrics.titleFontSize,
						lineHeight: headerMetrics.titleFontSize + 5,
					}}
					numberOfLines={1}>
					{title}
				</Text>
				<View
					style={{ width: headerMetrics.buttonSize, height: headerMetrics.buttonSize }}
				/>
			</View>
			<View
				className={`flex-1 mt-4 px-4 ${lightMode ? 'bg-white' : 'bg-black'}`}
				style={{ marginBottom: Math.max(insets.bottom, 20) }}>
				<InvertedSchemaPreview
					imageUrl={imageUrl}
					aspectRatio={aspectRatio}
					zoomable
					lightMode={lightMode}
				/>
			</View>
		</View>
	);
}

export function PortraitChatLayout<TMessage extends ChatMessageItem>({
	lightMode = false,
	currentSource,
	logoUrl,
	isTablet,
	height,
	keyboardFrame,
	hasStartedChat,
	showTextInput,
	inputText,
	messages,
	reserveMessageScrollSpace,
	shouldFocusStartPromptInput,
	isListening,
	isMicStarting,
	isMicProcessing,
	isMicRestartBlocked,
	isSpeechInputUnavailable,
	isVoiceOutputUnavailable,
	soundLevelAnim,
	currentImageAspectRatio,
	startPromptInputRef,
	messagesScrollViewRef,
	sourcePanelProps,
	machineInfoPanelProps,
	sourcePanelFullScreen,
	onBack,
	onOpenMachineInfo,
	onOpenFilesPanel,
	onSendText,
	onChangeText,
	onShowTextInputChange,
	onShouldFocusStartPromptInputChange,
	onOpenSchema,
	onOpenSource,
	onRetryMessage,
	onContinueMessage,
	isRetryDisabled,
	onUserMessageLayout,
	pendingPhotoUris,
	onRemovePendingPhoto,
	onMicPress,
	onCameraPress,
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
	const portraitRestingInputBottom = portraitControlsBottom + portraitControlsHeight + 12;
	const headerMetrics = getPortraitChatHeaderMetrics({
		isTablet,
		topInset: insets.top,
	});
	const headerSafeTop = headerMetrics.paddingTop;
	const headerHeight = headerMetrics.height;
	const headerButtonSize = headerMetrics.buttonSize;
	const headerIconSize = headerMetrics.iconSize;
	const headerLogoHeight = isPhonePortrait ? 15 : 20;
	const headerLogoMaxWidth = isPhonePortrait ? 110 : 120;
	const headerTitleFontSize = headerMetrics.titleFontSize;
	const keyboardOverlap = keyboardFrame
		? Math.max(0, keyboardFrame.height, Dimensions.get('screen').height - keyboardFrame.screenY)
		: 0;
	const portraitInputBottom = keyboardFrame ? keyboardOverlap + 12 : portraitRestingInputBottom;
	const portraitMessagesBottomPadding = Math.max(
		portraitControlsHeight + 54,
		portraitInputBottom + (showTextInput ? (pendingPhotoUris.length > 0 ? 180 : 70) : 0),
	);

	return (
		<View className={`flex-1 ${lightMode ? 'bg-[#F7F5F1]' : 'bg-[#080808]'}`}>
			<ChatBackgroundTexture lightMode={lightMode} />
			<View
				className={`px-4 flex-row items-center border-b z-10 ${lightMode ? 'bg-white' : 'bg-[#0D0D0D]'}`}
				style={{
					height: headerHeight,
					paddingTop: headerSafeTop,
					borderBottomColor: lightMode ? 'rgba(20, 20, 20, 0.06)' : '#1F1F1F',
					shadowColor: '#141414',
					shadowOffset: { width: 0, height: 2 },
					shadowOpacity: lightMode ? 0.025 : 0,
					shadowRadius: 8,
					elevation: lightMode ? 1 : 0,
				}}>
				<TouchableOpacity
					onPress={onBack}
					className={`items-center justify-center border rounded-[10px] ${
						lightMode ? 'border-[#E4E4E7] bg-white' : 'border-[#2A2A2A] bg-[#0D0D0D]'
					}`}
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
							lightMode={lightMode}
							onPress={onOpenMachineInfo}
						/>
					</View>
				</View>

				<View
					className={`flex-row items-center ${isPhonePortrait ? 'gap-1.5' : 'gap-2'}`}
					style={{ flexShrink: 0 }}>
					<TouchableOpacity
						onPress={onOpenMachineInfo}
						accessibilityRole='button'
						accessibilityLabel='O maszynie'
						className={`items-center justify-center border rounded-[10px] ${
							lightMode
								? 'border-[#E4E4E7] bg-[#FAFAFA]'
								: 'border-[#2A2A2A] bg-[#111111]'
						}`}
						style={{
							width: headerButtonSize,
							height: headerButtonSize,
						}}>
						<Feather
							name='info'
							size={isPhonePortrait ? 18 : 20}
							color={PRIMARY_ORANGE}
						/>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={onOpenFilesPanel}
						className={`items-center justify-center border rounded-[10px] ${
							lightMode
								? 'border-[#E4E4E7] bg-[#FAFAFA]'
								: 'border-[#2A2A2A] bg-[#111111]'
						}`}
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
					className='flex-1 px-4'
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{
						paddingTop: 16,
						paddingBottom: reserveMessageScrollSpace
							? Math.max(portraitMessagesBottomPadding, height)
							: portraitMessagesBottomPadding,
					}}>
					<ChatMessages
						messages={messages}
						compact
						isListening={isListening}
						soundLevelAnim={soundLevelAnim}
						onOpenSchema={onOpenSchema}
						onOpenSource={onOpenSource}
						onRetryMessage={onRetryMessage}
						onContinueMessage={onContinueMessage}
						isRetryDisabled={isRetryDisabled}
						onUserMessageLayout={onUserMessageLayout}
						lightMode={lightMode}
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
					pendingPhotoUris={pendingPhotoUris}
					onRemovePendingPhoto={onRemovePendingPhoto}
					lightMode={lightMode}
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
						pendingPhotoUris={pendingPhotoUris}
						onRemovePendingPhoto={onRemovePendingPhoto}
						lightMode={lightMode}
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
					isMicStarting={isMicStarting}
					isMicProcessing={isMicProcessing}
					isMicRestartBlocked={isMicRestartBlocked}
					isSpeechInputUnavailable={isSpeechInputUnavailable}
					isVoiceOutputUnavailable={isVoiceOutputUnavailable}
					isWritingActive={showTextInput}
					attachedPhotoCount={pendingPhotoUris.length}
					isCameraDisabled={pendingPhotoUris.length >= MAX_CHAT_PHOTOS}
					onMicPress={onMicPress}
					onCameraPress={onCameraPress}
					onWritingPress={onWritingPress}
					lightMode={lightMode}
				/>
			</View>
			<SourcePanel
				{...sourcePanelProps}
				fullScreen={sourcePanelFullScreen}
				topInset={sourcePanelFullScreen ? insets.top : 0}
				fileGridColumns={isTablet ? 3 : 2}
				headerHeight={headerHeight}
				headerPaddingTop={headerSafeTop}
				headerTitleFontSize={headerTitleFontSize}
				headerTitleLineHeight={headerTitleFontSize + 5}
				backButtonSize={headerButtonSize}
				backIconSize={headerIconSize}
				lightMode={lightMode}
			/>
			<MachineInfoPanel
				{...machineInfoPanelProps}
				fullScreen={sourcePanelFullScreen}
				topInset={sourcePanelFullScreen ? insets.top : 0}
				headerHeight={headerHeight}
				headerPaddingTop={headerSafeTop}
				headerTitleFontSize={headerTitleFontSize}
				headerTitleLineHeight={headerTitleFontSize + 5}
				backButtonSize={headerButtonSize}
				backIconSize={headerIconSize}
				lightMode={lightMode}
			/>
		</View>
	);
}

export function DesktopChatLayout<TMessage extends ChatMessageItem>({
	lightMode = false,
	currentSource,
	logoUrl,
	height,
	keyboardFrame,
	hasStartedChat,
	showTextInput,
	inputText,
	messages,
	reserveMessageScrollSpace,
	shouldFocusStartPromptInput,
	isListening,
	isMicStarting,
	isMicProcessing,
	isMicRestartBlocked,
	isSpeechInputUnavailable,
	isVoiceOutputUnavailable,
	soundLevelAnim,
	currentImageAspectRatio,
	startPromptInputRef,
	messagesScrollViewRef,
	sourcePanelProps,
	machineInfoPanelProps,
	sourcePanelFullScreen,
	onBack,
	onOpenMachineInfo,
	onOpenFilesPanel,
	onSendText,
	onChangeText,
	onShowTextInputChange,
	onShouldFocusStartPromptInputChange,
	onOpenSchema,
	onOpenSource,
	onRetryMessage,
	onContinueMessage,
	isRetryDisabled,
	onUserMessageLayout,
	pendingPhotoUris,
	onRemovePendingPhoto,
	onMicPress,
	onCameraPress,
	onWritingPress,
}: SharedLayoutProps<TMessage>) {
	const keyboardOverlap = keyboardFrame
		? Math.max(0, keyboardFrame.height, Dimensions.get('screen').height - keyboardFrame.screenY)
		: 0;
	const desktopInputBottom = keyboardFrame
		? Math.max(24, keyboardOverlap + KEYBOARD_INPUT_GAP)
		: 24;

	return (
		<View className={`flex-1 ${lightMode ? 'bg-[#F7F5F1]' : 'bg-[#080808]'}`}>
			<ChatBackgroundTexture lightMode={lightMode} />
			<View
				className={`h-[76px] px-6 flex-row items-center border-b z-10 ${lightMode ? 'bg-white' : 'bg-[#0D0D0D]'}`}
				style={{
					borderBottomColor: lightMode ? 'rgba(20, 20, 20, 0.06)' : '#1F1F1F',
					shadowColor: '#141414',
					shadowOffset: { width: 0, height: 2 },
					shadowOpacity: lightMode ? 0.025 : 0,
					shadowRadius: 8,
					elevation: lightMode ? 1 : 0,
				}}>
				<TouchableOpacity
					onPress={onBack}
					className={`h-12 px-[18px] flex-row items-center justify-center mr-8 border rounded-[10px] ${
						lightMode ? 'border-[#E4E4E7] bg-white' : 'border-[#2A2A2A] bg-[#0D0D0D]'
					}`}>
					<Feather name='arrow-left' size={22} color='#FF7A00' />
					<Text className='text-[#FF7A00] ml-4 text-[13px] font-semibold tracking-wider'>
						WSTECZ
					</Text>
				</TouchableOpacity>

				<View className='flex-row items-center'>
					{logoUrl ? (
						<HeaderLogo
							uri={logoUrl}
							height={20}
							maxWidth={136}
							lightMode={lightMode}
						/>
					) : null}
					<Text
						className={`${lightMode ? 'text-[#18181B]' : 'text-white'} text-[20px] font-bold ml-5 tracking-wider`}>
						{currentSource}
					</Text>
				</View>

				<View className='flex-1' />

				<TouchableOpacity
					onPress={onOpenMachineInfo}
					accessibilityRole='button'
					accessibilityLabel='O maszynie'
					className={`h-12 px-[18px] mr-3 flex-row items-center justify-center border rounded-[10px] ${
						lightMode
							? 'border-[#E4E4E7] bg-[#FAFAFA]'
							: 'border-[#2A2A2A] bg-[#111111]'
					}`}>
					<Feather name='info' size={21} color='#FF7A00' />
					<Text
						className={`${lightMode ? 'text-[#3F3F46]' : 'text-[#E6E6E6]'} ml-4 text-[13px] font-semibold tracking-wider`}>
						O MASZYNIE
					</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={onOpenFilesPanel}
					className={`h-12 px-[18px] flex-row items-center justify-center border rounded-[10px] ${
						lightMode
							? 'border-[#E4E4E7] bg-[#FAFAFA]'
							: 'border-[#2A2A2A] bg-[#111111]'
					}`}>
					<Feather name='link' size={21} color='#FF7A00' />
					<Text
						className={`${lightMode ? 'text-[#3F3F46]' : 'text-[#E6E6E6]'} ml-4 text-[13px] font-semibold tracking-wider`}>
						WSZYSTKIE PLIKI
					</Text>
				</TouchableOpacity>
			</View>

			<View className='flex-1 flex-row px-6 pb-5'>
				{hasStartedChat ? (
					<ScrollView
						ref={messagesScrollViewRef}
						className='flex-1 pr-8'
						contentContainerStyle={{
							paddingTop: 20,
							paddingBottom: reserveMessageScrollSpace ? Math.max(30, height) : 30,
						}}>
						<ChatMessages
							messages={messages}
							isListening={isListening}
							soundLevelAnim={soundLevelAnim}
							onOpenSchema={onOpenSchema}
							onOpenSource={onOpenSource}
							onRetryMessage={onRetryMessage}
							onContinueMessage={onContinueMessage}
							isRetryDisabled={isRetryDisabled}
							onUserMessageLayout={onUserMessageLayout}
							lightMode={lightMode}
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
						pendingPhotoUris={pendingPhotoUris}
						onRemovePendingPhoto={onRemovePendingPhoto}
						lightMode={lightMode}
					/>
				)}

				<View className='relative self-center ml-5'>
					<ControlPanel
						orientation='vertical'
						isListening={isListening}
						isMicStarting={isMicStarting}
						isMicProcessing={isMicProcessing}
						isMicRestartBlocked={isMicRestartBlocked}
						isSpeechInputUnavailable={isSpeechInputUnavailable}
						isVoiceOutputUnavailable={isVoiceOutputUnavailable}
						isWritingActive={showTextInput}
						attachedPhotoCount={pendingPhotoUris.length}
						isCameraDisabled={pendingPhotoUris.length >= MAX_CHAT_PHOTOS}
						onMicPress={onMicPress}
						onCameraPress={onCameraPress}
						onWritingPress={onWritingPress}
						lightMode={lightMode}
					/>
				</View>
			</View>

			{showTextInput && hasStartedChat ? (
				<View
					className='absolute left-6 right-[245px]'
					style={{ bottom: desktopInputBottom }}>
					<FloatingChatInput
						inputText={inputText}
						onChangeText={onChangeText}
						onSend={onSendText}
						autoFocus
						pendingPhotoUris={pendingPhotoUris}
						onRemovePendingPhoto={onRemovePendingPhoto}
						lightMode={lightMode}
					/>
				</View>
			) : null}
			<SourcePanel
				{...sourcePanelProps}
				fullScreen={sourcePanelFullScreen}
				lightMode={lightMode}
			/>
			<MachineInfoPanel
				{...machineInfoPanelProps}
				fullScreen={sourcePanelFullScreen}
				lightMode={lightMode}
			/>
		</View>
	);
}
