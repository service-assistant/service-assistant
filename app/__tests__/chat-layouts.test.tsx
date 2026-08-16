import React from 'react';

import type { ChatMessageItem } from '@/components/chat/ChatMessages';
import {
	DesktopChatLayout,
	FullscreenSchemaView,
	PortraitChatLayout,
} from '../components/chat/ChatLayouts';
import { findByText, findByType, getTextContent } from '../test-utils/react-tree';

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');
	return {
		...actualReact,
		useEffect: (callback: () => void | (() => void)) => callback(),
		useRef: (initialValue: unknown) => ({ current: initialValue }),
		useState: (initialValue: unknown) => [initialValue, jest.fn()],
	};
});

jest.mock('react-native', () => {
	const React = require('react');
	const createHost = (name: string) =>
		function HostComponent({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};

	const animation = { start: jest.fn(), stop: jest.fn() };

	return {
		Animated: {
			Value: jest.fn(() => ({ setValue: jest.fn(), stopAnimation: jest.fn() })),
			Text: createHost('AnimatedText'),
			delay: jest.fn(() => animation),
			loop: jest.fn(() => animation),
			sequence: jest.fn(() => animation),
			timing: jest.fn(() => animation),
		},
		Dimensions: {
			get: jest.fn(() => ({ width: 1280, height: 800 })),
		},
		Image: Object.assign(createHost('Image'), {
			getSize: jest.fn((_uri, onSuccess) => onSuccess(300, 100)),
		}),
		Platform: { OS: 'ios' },
		Pressable: createHost('Pressable'),
		ScrollView: createHost('ScrollView'),
		StyleSheet: {
			absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
		},
		Text: createHost('Text'),
		TextInput: createHost('TextInput'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
	};
});

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	return {
		Feather: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('Icon', props, children),
	};
});

jest.mock('../components/chat/ChatMessages', () => {
	const React = require('react');
	const ChatMessages = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('ChatMessages', props, children);
	const InvertedSchemaPreview = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('InvertedSchemaPreview', props, children);

	return {
		__esModule: true,
		default: ChatMessages,
		InvertedSchemaPreview,
	};
});

jest.mock('../components/chat/ControlPanel', () => {
	const React = require('react');
	return function MockControlPanel({ children, ...props }: Record<string, unknown>) {
		return React.createElement('ControlPanel', props, children);
	};
});

jest.mock('../components/documents/SourcePanel', () => {
	const React = require('react');
	return function MockSourcePanel({ children, ...props }: Record<string, unknown>) {
		return React.createElement('SourcePanel', props, children);
	};
});

jest.mock('../components/chat/MachineInfoPanel', () => {
	const React = require('react');
	return function MockMachineInfoPanel({ children, ...props }: Record<string, unknown>) {
		return React.createElement('MachineInfoPanel', props, children);
	};
});

jest.mock('../components/chat/StartPromptView', () => {
	const React = require('react');
	return function MockStartPromptView({ children, ...props }: Record<string, unknown>) {
		return React.createElement('StartPromptView', props, children);
	};
});

const sourcePanelProps = {
	showSourcePanel: false,
	sourcePanelPdf: null,
	isAvailableFilesLoading: false,
	availableFiles: [],
	isFileDownloading: false,
	downloadingFileId: null,
	downloadedFileIds: new Set<number>(),
	onOpenFile: jest.fn(),
	onDeleteDownloadedFile: jest.fn(),
	onClose: jest.fn(),
};

const machineInfoPanelProps = {
	showMachineInfoPanel: false,
	deviceName: 'Toyota 8FG',
	nameplateData: null,
	onClose: jest.fn(),
};

const messages: ChatMessageItem[] = [{ id: 1, sender: 'ai', text: 'Gotowe' }];

const createLayoutProps = () => ({
	currentSource: 'Toyota 8FG',
	logoUrl: 'https://api.example.test/logo.png',
	isTablet: false,
	height: 800,
	keyboardFrame: null,
	hasStartedChat: true,
	showTextInput: false,
	inputText: 'pytanie',
	messages,
	reserveMessageScrollSpace: false,
	shouldFocusStartPromptInput: false,
	isListening: false,
	isMicStarting: false,
	isMicProcessing: false,
	isMicRestartBlocked: false,
	isSpeechInputUnavailable: false,
	isVoiceOutputUnavailable: false,
	soundLevelAnim: {} as any,
	currentImageAspectRatio: 1.5,
	startPromptInputRef: { current: null },
	messagesScrollViewRef: { current: { scrollToEnd: jest.fn() } } as any,
	sourcePanelProps,
	machineInfoPanelProps,
	sourcePanelFullScreen: false,
	onBack: jest.fn(),
	onOpenMachineInfo: jest.fn(),
	onOpenFilesPanel: jest.fn(),
	onSendText: jest.fn(),
	onChangeText: jest.fn(),
	onShowTextInputChange: jest.fn(),
	onShouldFocusStartPromptInputChange: jest.fn(),
	onOpenSchema: jest.fn(),
	onOpenSource: jest.fn(),
	onRetryMessage: jest.fn(),
	onContinueMessage: jest.fn(),
	onUserMessageLayout: jest.fn(),
	pendingPhotoUris: [],
	onRemovePendingPhoto: jest.fn(),
	onMicPress: jest.fn(),
	onMicCancel: jest.fn(),
	onCameraPress: jest.fn(),
	onWritingPress: jest.fn(),
});

describe('ChatLayouts', () => {
	test('renders the background texture only in light mode', () => {
		const lightTree = <DesktopChatLayout {...createLayoutProps()} lightMode />;
		const darkTree = <DesktopChatLayout {...createLayoutProps()} lightMode={false} />;
		const lightTextures = findByType(lightTree, 'Image').filter(
			(image) => image.props.testID === 'chat-background-texture',
		);
		const darkTextures = findByType(darkTree, 'Image').filter(
			(image) => image.props.testID === 'chat-background-texture',
		);

		expect(lightTextures).toHaveLength(1);
		expect(lightTextures[0].props.style.opacity).toBe(0.32);
		expect(darkTextures).toHaveLength(0);
	});

	test('DesktopChatLayout renders chat messages, controls and header actions', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} />;
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[0].props.onPress();
		buttons.find((button) => button.props.accessibilityLabel === 'O maszynie')?.props.onPress();
		buttons
			.find((button) => getTextContent(button).includes('WSZYSTKIE PLIKI'))
			?.props.onPress();

		expect(getTextContent(tree)).toContain('Toyota 8FG');
		expect(findByType(tree, 'ChatMessages')[0].props.messages).toBe(messages);
		expect(getTextContent(tree)).toContain('O MASZYNIE');
		expect(findByType(tree, 'ControlPanel')[0].props.orientation).toBe('vertical');
		expect(findByType(tree, 'SourcePanel')).toHaveLength(0);
		expect(props.onBack).toHaveBeenCalled();
		expect(props.onOpenMachineInfo).toHaveBeenCalled();
		expect(props.onOpenFilesPanel).toHaveBeenCalled();
		expect(findByType(tree, 'ScrollView')[0].props.contentContainerStyle.paddingBottom).toBe(
			30,
		);
		findByType(tree, 'ChatMessages')[0].props.onUserMessageLayout(messages[0], 120);
		expect(props.onUserMessageLayout).toHaveBeenCalledWith(messages[0], 120);
	});

	test('DesktopChatLayout renders sources and files in a panel beside the chat', () => {
		const props = createLayoutProps();
		const tree = (
			<DesktopChatLayout
				{...props}
				sourcePanelProps={{ ...sourcePanelProps, showSourcePanel: true }}
			/>
		);
		const previewPanel = findByType(tree, 'View').find(
			(view) => view.props.testID === 'desktop-chat-preview-panel',
		);

		expect(previewPanel?.props.style).toMatchObject({
			width: '44%',
			minWidth: 420,
			maxWidth: 720,
		});
		expect(findByType(tree, 'SourcePanel')[0].props).toMatchObject({
			...sourcePanelProps,
			showSourcePanel: true,
			embedded: true,
			fileGridColumns: 2,
		});
	});

	test('DesktopChatLayout renders an opened schema in the panel beside the chat', () => {
		const props = createLayoutProps();
		const onCloseDesktopSchema = jest.fn();
		const tree = (
			<DesktopChatLayout
				{...props}
				desktopSchemaPreview={{
					imageUrl: 'data:image/png;base64,schema',
					title: 'SCHEMAT 1',
				}}
				onCloseDesktopSchema={onCloseDesktopSchema}
			/>
		);

		expect(findByText(tree, 'SCHEMAT 1')).toBeUndefined();
		expect(findByType(tree, 'InvertedSchemaPreview')[0].props.imageUrl).toBe(
			'data:image/png;base64,schema',
		);
		expect(findByType(tree, 'SourcePanel')).toHaveLength(0);

		findByType(tree, 'TouchableOpacity')
			.find((button) => button.props.accessibilityLabel === 'Wstecz')
			?.props.onPress();
		expect(onCloseDesktopSchema).toHaveBeenCalled();
	});

	test('DesktopChatLayout falls back to full-screen previews when the side panel is disabled', () => {
		const props = createLayoutProps();
		const sourceTree = (
			<DesktopChatLayout
				{...props}
				enableDesktopPreview={false}
				sourcePanelProps={{ ...sourcePanelProps, showSourcePanel: true }}
			/>
		);
		const schemaTree = (
			<DesktopChatLayout
				{...props}
				enableDesktopPreview={false}
				desktopSchemaPreview={{ imageUrl: 'data:image/png;base64,schema' }}
			/>
		);

		expect(findByType(sourceTree, 'SourcePanel')[0].props).toMatchObject({
			showSourcePanel: true,
			fullScreen: true,
		});
		expect(
			findByType(sourceTree, 'View').find(
				(view) => view.props.testID === 'desktop-chat-preview-panel',
			),
		).toBeUndefined();
		expect(findByText(schemaTree, 'SCHEMAT POMOCNICZY')).toBeTruthy();
		expect(findByType(schemaTree, 'InvertedSchemaPreview')[0].props.imageUrl).toBe(
			'data:image/png;base64,schema',
		);
	});

	test('DesktopChatLayout renders start prompt before chat starts', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} hasStartedChat={false} />;
		const startPrompt = findByType(tree, 'StartPromptView')[0];

		expect(startPrompt.props.inputText).toBe('pytanie');
		expect(startPrompt.props.onSend).toBe(props.onSendText);
		expect(findByType(tree, 'ChatMessages')).toHaveLength(0);
	});

	test('web layout hides device controls and centers the start prompt', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} hasStartedChat={false} hideControlPanel />;

		expect(findByType(tree, 'ControlPanel')).toHaveLength(0);
		expect(findByType(tree, 'StartPromptView')).toHaveLength(1);
	});

	test('web layout keeps a text composer available after the chat starts', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} hideControlPanel />;

		expect(findByType(tree, 'ControlPanel')).toHaveLength(0);
		expect(findByType(tree, 'TextInput')).toHaveLength(1);
		expect(findByType(tree, 'TextInput')[0].props.autoFocus).toBe(false);
		expect(findByType(tree, 'ScrollView')[0].props.className).toContain('chat-scrollbar-dark');
		expect(findByType(tree, 'ScrollView')[0].props.style).toMatchObject({
			width: '100%',
		});
		expect(
			findByType(tree, 'View').some(
				(view) => view.props.style?.width === '100%' && view.props.style?.maxWidth === 980,
			),
		).toBe(true);
		expect(findByType(tree, 'ScrollView')[0].props.contentContainerStyle.paddingBottom).toBe(
			144,
		);
		expect(
			findByType(tree, 'View').some(
				(view) =>
					view.props.style?.width === '100%' &&
					view.props.style?.maxWidth === 980 &&
					view.props.style?.alignSelf === 'center',
			),
		).toBe(true);
	});

	test('DesktopChatLayout renders floating input after chat starts', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} showTextInput />;
		const input = findByType(tree, 'TextInput')[0];
		const sendButton = findByType(tree, 'TouchableOpacity').at(-1)!;

		input.props.onChangeText('nowe');
		input.props.onSubmitEditing();
		sendButton.props.onPress();

		expect(input.props.value).toBe('pytanie');
		expect(input.props.autoFocus).toBe(true);
		expect(findByType(tree, 'Reanimated.View')).toHaveLength(0);
		expect(findByType(tree, 'View').some((view) => view.props.style?.bottom === 24)).toBe(true);
		expect(props.onChangeText).toHaveBeenCalledWith('nowe');
		expect(props.onSendText).toHaveBeenCalledTimes(2);
	});

	test('shows and removes a pending technician photo', () => {
		const props = createLayoutProps();
		const tree = (
			<DesktopChatLayout
				{...props}
				showTextInput
				pendingPhotoUris={[
					'file:///technician-photo.jpg',
					'file:///second-technician-photo.jpg',
				]}
			/>
		);
		const photo = findByType(tree, 'Image').find(
			(image) => image.props.source?.uri === 'file:///technician-photo.jpg',
		);
		const removeButton = findByType(tree, 'TouchableOpacity').find(
			(button) => button.props.accessibilityLabel === 'Usuń dodane zdjęcie',
		);

		expect(photo).toBeDefined();
		expect(
			findByType(tree, 'Image').some(
				(image) => image.props.source?.uri === 'file:///second-technician-photo.jpg',
			),
		).toBe(true);
		removeButton?.props.onPress();
		expect(props.onRemovePendingPhoto).toHaveBeenCalledWith('file:///technician-photo.jpg');
	});

	test('snaps the desktop input to the final keyboard frame without animation', () => {
		const tree = (
			<DesktopChatLayout
				{...createLayoutProps()}
				height={800}
				keyboardFrame={{ screenY: 500, height: 240 }}
				showTextInput
			/>
		);

		expect(findByType(tree, 'View').some((view) => view.props.style?.bottom === 312)).toBe(
			true,
		);
		expect(findByType(tree, 'Reanimated.View')).toHaveLength(0);
	});

	test('snaps the portrait input to the final keyboard frame without animation', () => {
		const tree = (
			<PortraitChatLayout
				{...createLayoutProps()}
				height={800}
				keyboardFrame={{ screenY: 500, height: 240 }}
				showTextInput
				insets={{ top: 10, right: 0, bottom: 20, left: 0 }}
			/>
		);

		expect(findByType(tree, 'View').some((view) => view.props.style?.bottom === 312)).toBe(
			true,
		);
		expect(findByType(tree, 'Reanimated.View')).toHaveLength(0);
	});

	test('PortraitChatLayout renders compact chat and horizontal controls', () => {
		const props = createLayoutProps();
		const tree = (
			<PortraitChatLayout {...props} insets={{ top: 10, right: 0, bottom: 20, left: 0 }} />
		);
		const machineInfoButton = findByType(tree, 'TouchableOpacity').find(
			(button) => button.props.accessibilityLabel === 'O maszynie',
		)!;

		expect(findByType(tree, 'ChatMessages')[0].props.compact).toBe(true);
		expect(findByType(tree, 'ControlPanel')[0].props.orientation).toBe('horizontal');
		expect(getTextContent(machineInfoButton)).toBe('');
		expect(findByType(machineInfoButton, 'Icon')[0].props.name).toBe('info');
		expect(findByType(tree, 'SourcePanel')[0].props).toMatchObject(sourcePanelProps);
		expect(findByType(tree, 'SourcePanel')[0].props.fileGridColumns).toBe(2);
		expect(findByType(tree, 'SourcePanel')[0].props.headerHeight).toBe(74);
		expect(findByType(tree, 'SourcePanel')[0].props.backButtonSize).toBe(42);
		expect(findByType(tree, 'SourcePanel')[0].props.backIconSize).toBe(21);
		expect(findByType(tree, 'ScrollView')[0].props.contentContainerStyle.paddingBottom).toBe(
			216,
		);
		findByType(tree, 'ChatMessages')[0].props.onUserMessageLayout(messages[0], 120);
		expect(props.onUserMessageLayout).toHaveBeenCalledWith(messages[0], 120);
	});

	test('reserves viewport space only while a new message is active', () => {
		const props = createLayoutProps();
		const desktopTree = <DesktopChatLayout {...props} reserveMessageScrollSpace />;
		const portraitTree = (
			<PortraitChatLayout
				{...props}
				reserveMessageScrollSpace
				insets={{ top: 10, right: 0, bottom: 20, left: 0 }}
			/>
		);

		expect(
			findByType(desktopTree, 'ScrollView')[0].props.contentContainerStyle.paddingBottom,
		).toBe(800);
		expect(
			findByType(portraitTree, 'ScrollView')[0].props.contentContainerStyle.paddingBottom,
		).toBe(800);
	});

	test('PortraitChatLayout keeps three file columns on tablets', () => {
		const props = createLayoutProps();
		const tree = (
			<PortraitChatLayout
				{...props}
				isTablet
				sourcePanelFullScreen
				insets={{ top: 10, right: 0, bottom: 20, left: 0 }}
			/>
		);

		expect(findByType(tree, 'SourcePanel')[0].props.fileGridColumns).toBe(3);
		expect(findByType(tree, 'SourcePanel')[0].props.headerHeight).toBe(76);
		expect(findByType(tree, 'SourcePanel')[0].props.headerTitleFontSize).toBe(20);
		expect(findByType(tree, 'SourcePanel')[0].props.backButtonSize).toBe(48);
		expect(findByType(tree, 'SourcePanel')[0].props.backIconSize).toBe(23);
	});

	test('PortraitChatLayout renders start prompt before chat starts', () => {
		const props = createLayoutProps();
		const tree = (
			<PortraitChatLayout
				{...props}
				hasStartedChat={false}
				insets={{ top: 10, right: 0, bottom: 20, left: 0 }}
			/>
		);

		expect(findByType(tree, 'StartPromptView')[0].props.compact).toBe(true);
		expect(findByType(tree, 'ChatMessages')).toHaveLength(0);
	});

	test('web portrait layout removes controls and their reserved start-screen space', () => {
		const tree = (
			<PortraitChatLayout
				{...createLayoutProps()}
				hasStartedChat={false}
				hideControlPanel
				insets={{ top: 10, right: 0, bottom: 20, left: 0 }}
			/>
		);

		expect(findByType(tree, 'ControlPanel')).toHaveLength(0);
		expect(findByType(tree, 'StartPromptView')[0].props.reserveControlPanelSpace).toBe(false);
	});

	test('FullscreenSchemaView renders preview and back action', () => {
		const onBack = jest.fn();
		const tree = (
			<FullscreenSchemaView
				imageUrl='data:image/png;base64,abc'
				aspectRatio={1.6}
				insets={{ top: 10, right: 0, bottom: 22, left: 0 }}
				onBack={onBack}
			/>
		);

		findByType(tree, 'TouchableOpacity')[0].props.onPress();

		expect(findByText(tree, 'SCHEMAT POMOCNICZY')).toBeTruthy();
		expect(findByType(tree, 'InvertedSchemaPreview')[0].props).toMatchObject({
			imageUrl: 'data:image/png;base64,abc',
			aspectRatio: 1.6,
		});
		expect(onBack).toHaveBeenCalled();
	});

	test('FullscreenSchemaView displays an attached photo title', () => {
		const tree = (
			<FullscreenSchemaView
				imageUrl='file:///attached-photo.jpg'
				title='ZAŁĄCZONE ZDJĘCIE'
				aspectRatio={1}
				insets={{ top: 0, right: 0, bottom: 0, left: 0 }}
				onBack={jest.fn()}
			/>
		);

		expect(findByText(tree, 'ZAŁĄCZONE ZDJĘCIE')).toBeTruthy();
	});
});
