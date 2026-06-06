import { Feather } from '@expo/vector-icons';
import React from 'react';
import {
	Animated,
	Image,
	ScrollView,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
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
					backgroundColor: PRIMARY_ORANGE,
				}}>
				<Feather name='arrow-up-right' size={compact ? 24 : 30} color='#FFFFFF' />
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
	height: number;
	keyboardFrame: KeyboardFrame | null;
	hasStartedChat: boolean;
	showTextInput: boolean;
	inputText: string;
	messages: TMessage[];
	isListening: boolean;
	isMicProcessing: boolean;
	isMicRestartBlocked: boolean;
	soundLevelAnim: Animated.Value;
	currentImageAspectRatio: number;
	startPromptInputRef: TextInputRef;
	messagesScrollViewRef: ScrollViewRef;
	sourcePanelProps: SourcePanelProps;
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

const scrollToEnd = (ref: ScrollViewRef, _event?: NativeSyntheticEvent<NativeScrollEvent>) => {
	ref.current?.scrollToEnd({ animated: true });
};

export function FullscreenSchemaView({
	imageUrl,
	aspectRatio,
	insets,
	onBack,
}: FullscreenSchemaViewProps) {
	return (
		<View className='flex-1 bg-black px-4 pt-4'>
			<View className='h-14 flex-row items-center'>
				<TouchableOpacity
					onPress={onBack}
					className='h-12 px-5 flex-row items-center justify-center border border-[#FF7A00] bg-[#050505]'>
					<Feather name='arrow-left' size={22} color={PRIMARY_ORANGE} />
					<Text className='text-[#FF7A00] ml-3 text-[13px] font-semibold tracking-wider'>
						WRÓĆ DO CZATU
					</Text>
				</TouchableOpacity>
			</View>
			<ScrollView
				className='flex-1 mt-4'
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}>
				<View className='w-full bg-black'>
					<InvertedSchemaPreview imageUrl={imageUrl} aspectRatio={aspectRatio} />
				</View>
			</ScrollView>
		</View>
	);
}

export function PortraitChatLayout<TMessage extends ChatMessageItem>({
	currentSource,
	logoUrl,
	height,
	keyboardFrame,
	hasStartedChat,
	showTextInput,
	inputText,
	messages,
	isListening,
	isMicProcessing,
	isMicRestartBlocked,
	soundLevelAnim,
	currentImageAspectRatio,
	startPromptInputRef,
	messagesScrollViewRef,
	sourcePanelProps,
	onBack,
	onOpenMachineInfo,
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
	const portraitPanelHeight = 140;
	const portraitControlsBottom = insets.bottom > 0 ? insets.bottom + 14 : 24;
	const portraitControlsHeight = portraitPanelHeight;
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
			<View className='h-[76px] px-4 flex-row items-center border-b border-[#1F1F1F] bg-[#0D0D0D] shadow-2xl z-10'>
				<TouchableOpacity
					onPress={onBack}
					className='w-12 h-12 items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#0D0D0D]'>
					<Feather name='arrow-left' size={23} color={PRIMARY_ORANGE} />
				</TouchableOpacity>

				<View className='flex-1 flex-row items-center justify-center px-2 min-w-0'>
					{logoUrl ? (
						<HeaderLogo uri={logoUrl} height={20} maxWidth={120} marginRight={10} />
					) : null}
					<Text
						className='text-white text-[20px] font-bold tracking-wide'
						numberOfLines={1}
						adjustsFontSizeToFit>
						{currentSource}
					</Text>
				</View>

				<View className='flex-row items-center gap-2'>
					<TouchableOpacity
						onPress={onOpenMachineInfo}
						className='w-12 h-12 items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#111111]'>
						<Image
							source={require('../assets/images/info.png')}
							style={{ width: 21, height: 21, tintColor: PRIMARY_ORANGE }}
							resizeMode='contain'
						/>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={onOpenFilesPanel}
						className='w-12 h-12 items-center justify-center border border-[#2A2A2A] rounded-[10px] bg-[#111111]'>
						<Feather name='link' size={22} color={PRIMARY_ORANGE} />
					</TouchableOpacity>
				</View>
			</View>

			{hasStartedChat ? (
				<ScrollView
					ref={messagesScrollViewRef}
					onContentSizeChange={() => scrollToEnd(messagesScrollViewRef)}
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
				className='absolute left-0 right-0 items-center'
				style={{ bottom: portraitControlsBottom }}>
				<ControlPanel
					orientation='horizontal'
					isListening={isListening}
					isMicProcessing={isMicProcessing}
					isMicRestartBlocked={isMicRestartBlocked}
					isWritingActive={showTextInput}
					onMicPress={onMicPress}
					onWritingPress={onWritingPress}
				/>
			</View>
			<SourcePanel {...sourcePanelProps} />
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
	isListening,
	isMicProcessing,
	isMicRestartBlocked,
	soundLevelAnim,
	currentImageAspectRatio,
	startPromptInputRef,
	messagesScrollViewRef,
	sourcePanelProps,
	onBack,
	onOpenMachineInfo,
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
					onPress={onOpenMachineInfo}
					className='h-12 px-[18px] flex-row items-center justify-center mr-7 border border-[#2A2A2A] rounded-[10px] bg-[#111111]'>
					<Image
						source={require('../assets/images/info.png')}
						style={{ width: 21, height: 21, tintColor: PRIMARY_ORANGE }}
						resizeMode='contain'
					/>
					<Text className='text-[#E6E6E6] ml-4 text-[13px] font-semibold tracking-wider'>
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
						onContentSizeChange={() => scrollToEnd(messagesScrollViewRef)}
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
			<SourcePanel {...sourcePanelProps} />
		</View>
	);
}
