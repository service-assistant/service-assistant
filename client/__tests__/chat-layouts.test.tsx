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
		useState: (initialValue: unknown) => [initialValue, jest.fn()],
	};
});

jest.mock('react-native', () => {
	const React = require('react');
	const createHost = (name: string) =>
		function HostComponent({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};

	return {
		Animated: { Value: jest.fn() },
		Image: Object.assign(createHost('Image'), {
			getSize: jest.fn((_uri, onSuccess) => onSuccess(300, 100)),
		}),
		ScrollView: createHost('ScrollView'),
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

const messages: ChatMessageItem[] = [{ id: 1, sender: 'ai', text: 'Gotowe' }];

const createLayoutProps = () => ({
	currentSource: 'Toyota 8FG',
	logoUrl: 'https://api.example.test/logo.png',
	height: 800,
	keyboardFrame: null,
	hasStartedChat: true,
	showTextInput: false,
	inputText: 'pytanie',
	messages,
	isListening: false,
	isMicProcessing: false,
	isMicRestartBlocked: false,
	isSpeechInputUnavailable: false,
	isVoiceOutputUnavailable: false,
	soundLevelAnim: {} as any,
	currentImageAspectRatio: 1.5,
	startPromptInputRef: { current: null },
	messagesScrollViewRef: { current: { scrollToEnd: jest.fn() } } as any,
	sourcePanelProps,
	onBack: jest.fn(),
	onOpenMachineInfo: jest.fn(),
	onOpenFilesPanel: jest.fn(),
	onSendText: jest.fn(),
	onChangeText: jest.fn(),
	onShowTextInputChange: jest.fn(),
	onShouldFocusStartPromptInputChange: jest.fn(),
	onOpenSchema: jest.fn(),
	onOpenSource: jest.fn(),
	onMicPress: jest.fn(),
	onWritingPress: jest.fn(),
});

describe('ChatLayouts', () => {
	test('DesktopChatLayout renders chat messages, controls, source panel and header actions', () => {
		const props = createLayoutProps();
		const tree = <DesktopChatLayout {...props} />;
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[0].props.onPress();
		buttons[1].props.onPress();
		buttons[2].props.onPress();

		expect(getTextContent(tree)).toContain('Toyota 8FG');
		expect(findByType(tree, 'ChatMessages')[0].props.messages).toBe(messages);
		expect(findByType(tree, 'ControlPanel')[0].props.orientation).toBe('vertical');
		expect(findByType(tree, 'SourcePanel')[0].props).toMatchObject(sourcePanelProps);
		expect(props.onBack).toHaveBeenCalled();
		expect(props.onOpenMachineInfo).toHaveBeenCalled();
		expect(props.onOpenFilesPanel).toHaveBeenCalled();
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
		expect(props.onChangeText).toHaveBeenCalledWith('nowe');
		expect(props.onSendText).toHaveBeenCalledTimes(2);
	});

	test('PortraitChatLayout renders compact chat and horizontal controls', () => {
		const props = createLayoutProps();
		const tree = (
			<PortraitChatLayout {...props} insets={{ top: 10, right: 0, bottom: 20, left: 0 }} />
		);

		expect(findByType(tree, 'ChatMessages')[0].props.compact).toBe(true);
		expect(findByType(tree, 'ControlPanel')[0].props.orientation).toBe('horizontal');
		expect(findByType(tree, 'SourcePanel')[0].props).toMatchObject(sourcePanelProps);
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

		expect(findByText(tree, 'WRÓĆ DO CZATU')).toBeTruthy();
		expect(findByType(tree, 'InvertedSchemaPreview')[0].props).toMatchObject({
			imageUrl: 'data:image/png;base64,abc',
			aspectRatio: 1.6,
		});
		expect(onBack).toHaveBeenCalled();
	});
});
