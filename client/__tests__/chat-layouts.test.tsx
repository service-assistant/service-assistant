import React from 'react';

import type { ChatMessageItem } from '@/components/ChatMessages';
import {
	DesktopChatLayout,
	FullscreenSchemaView,
	PortraitChatLayout,
} from '../components/ChatLayouts';
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
		Image: Object.assign(createHost('Image'), {
			getSize: jest.fn((_uri, onSuccess) => onSuccess(300, 100)),
		}),
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

jest.mock('react-native-keyboard-controller', () => {
	return {
		useGenericKeyboardHandler: jest.fn(),
		useReanimatedKeyboardAnimation: () => ({
			height: { value: 0 },
			progress: { value: 0 },
		}),
	};
});

jest.mock('react-native-reanimated', () => {
	const React = require('react');
	return {
		__esModule: true,
		default: {
			View: ({ children, ...props }: Record<string, unknown>) =>
				React.createElement('Reanimated.View', props, children),
		},
		useAnimatedStyle: (factory: () => unknown) => factory(),
		useSharedValue: (value: unknown) => ({ value }),
	};
});

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	return {
		Feather: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('Icon', props, children),
	};
});

jest.mock('../components/ChatMessages', () => {
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

jest.mock('../components/ControlPanel', () => {
	const React = require('react');
	return function MockControlPanel({ children, ...props }: Record<string, unknown>) {
		return React.createElement('ControlPanel', props, children);
	};
});

jest.mock('../components/SourcePanel', () => {
	const React = require('react');
	return function MockSourcePanel({ children, ...props }: Record<string, unknown>) {
		return React.createElement('SourcePanel', props, children);
	};
});

jest.mock('../components/MachineInfoPanel', () => {
	const React = require('react');
	return function MockMachineInfoPanel({ children, ...props }: Record<string, unknown>) {
		return React.createElement('MachineInfoPanel', props, children);
	};
});

jest.mock('../components/StartPromptView', () => {
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
	onMicPress: jest.fn(),
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

	test('DesktopChatLayout renders chat messages, controls, source panel and header actions', () => {
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
		expect(findByType(tree, 'SourcePanel')[0].props).toMatchObject(sourcePanelProps);
		expect(props.onBack).toHaveBeenCalled();
		expect(props.onOpenMachineInfo).toHaveBeenCalled();
		expect(props.onOpenFilesPanel).toHaveBeenCalled();
		expect(findByType(tree, 'ScrollView')[0].props.contentContainerStyle.paddingBottom).toBe(
			30,
		);
		findByType(tree, 'ChatMessages')[0].props.onUserMessageLayout(messages[0], 120);
		expect(props.onUserMessageLayout).toHaveBeenCalledWith(messages[0], 120);
	});

	test('DesktopChatLayout renders start prompt before chat starts', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} hasStartedChat={false} />;
		const startPrompt = findByType(tree, 'StartPromptView')[0];

		expect(startPrompt.props.inputText).toBe('pytanie');
		expect(startPrompt.props.onSend).toBe(props.onSendText);
		expect(findByType(tree, 'ChatMessages')).toHaveLength(0);
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
		expect(findByType(tree, 'Reanimated.View')).toHaveLength(1);
		expect(findByType(tree, 'View').some((view) => view.props.style?.bottom === 24)).toBe(true);
		expect(props.onChangeText).toHaveBeenCalledWith('nowe');
		expect(props.onSendText).toHaveBeenCalledTimes(2);
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
});
