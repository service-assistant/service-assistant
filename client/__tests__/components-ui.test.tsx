import React from 'react';

import type { AvailableFile } from '@/types/chat';
import AvailableFilesList from '../components/AvailableFilesList';
import ServiceErrorModal from '../components/ServiceErrorModal';
import StartPromptView from '../components/StartPromptView';

let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;
let mockScreenDimensions = { width: 1280, height: 800 };

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');
	return {
		...actualReact,
		useEffect: (callback: () => void | (() => void)) => callback(),
		useRef: (initialValue: unknown) => ({ current: initialValue }),
		useState: (initialValue: unknown) => {
			const stateIndex = mockReactStateIndex;
			mockReactStateIndex += 1;

			if (mockReactStateValues.length <= stateIndex) {
				mockReactStateValues[stateIndex] =
					typeof initialValue === 'function' ? initialValue() : initialValue;
			}

			const setValue = (nextValue: unknown) => {
				mockReactStateValues[stateIndex] =
					typeof nextValue === 'function'
						? nextValue(mockReactStateValues[stateIndex])
						: nextValue;
			};

			return [mockReactStateValues[stateIndex], setValue];
		},
	};
});

jest.mock('react-native', () => {
	const React = require('react');
	const createHost = (name: string) =>
		function HostComponent({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};
	const animatedValue = () => ({
		setValue: jest.fn(),
		stopAnimation: jest.fn(),
	});

	return {
		ActivityIndicator: createHost('ActivityIndicator'),
		Animated: {
			Text: createHost('Animated.Text'),
			Value: jest.fn(animatedValue),
			parallel: jest.fn(() => ({
				start: (callback?: (result: { finished: boolean }) => void) =>
					callback?.({ finished: true }),
			})),
			timing: jest.fn(() => ({
				start: (callback?: (result: { finished: boolean }) => void) =>
					callback?.({ finished: true }),
			})),
		},
		Dimensions: {
			get: jest.fn(() => mockScreenDimensions),
		},
		Modal: createHost('Modal'),
		Platform: { OS: 'android' },
		Pressable: createHost('Pressable'),
		ScrollView: createHost('ScrollView'),
		StyleSheet: { hairlineWidth: 0.5 },
		Text: createHost('Text'),
		TextInput: createHost('TextInput'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
	};
});

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	const Icon = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Icon', props, children);

	return {
		Feather: Icon,
		MaterialCommunityIcons: Icon,
	};
});

type ElementNode = React.ReactElement & {
	props: Record<string, any>;
};

const isElement = (value: unknown): value is ElementNode => React.isValidElement(value);

const collectElements = (node: unknown): ElementNode[] => {
	if (node === null || node === undefined || typeof node === 'boolean') return [];
	if (Array.isArray(node)) return node.flatMap(collectElements);
	if (!isElement(node)) return [];
	const elementType = node.type as any;
	if (elementType === React.Fragment) {
		return React.Children.toArray(node.props.children).flatMap((child) =>
			collectElements(child),
		);
	}
	if (typeof elementType === 'function') {
		return collectElements(elementType(node.props));
	}

	return [
		node,
		...React.Children.toArray(node.props.children).flatMap((child) => collectElements(child)),
	];
};

const getTextContent = (node: unknown): string => {
	if (node === null || node === undefined || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(getTextContent).join('');
	if (!isElement(node)) return '';
	const elementType = node.type as any;
	if (elementType === React.Fragment) {
		return React.Children.toArray(node.props.children).map(getTextContent).join('');
	}
	if (typeof elementType === 'function') return getTextContent(elementType(node.props));

	return React.Children.toArray(node.props.children).map(getTextContent).join('');
};

const findByType = (node: unknown, type: string) =>
	collectElements(node).filter((element) => element.type === type);

const findByText = (node: unknown, text: string) =>
	collectElements(node).find((element) => getTextContent(element).includes(text));

beforeEach(() => {
	mockReactStateValues = [];
	mockReactStateIndex = 0;
	mockScreenDimensions = { width: 1280, height: 800 };
});

const files: AvailableFile[] = [
	{
		id: 1,
		name: 'Manual.pdf',
		icon: 'file-pdf-box',
		color: '#EF4444',
		remoteUrl: 'https://api.example.test/manual.pdf',
	},
	{
		id: 2,
		name: 'Schemat.pdf',
		icon: 'file-document',
		color: '#22C55E',
		remoteUrl: 'https://api.example.test/schemat.pdf',
	},
];

describe('ServiceErrorModal', () => {
	test('wires modal visibility, request close, and dismiss button', () => {
		const onClose = jest.fn();
		const tree = (
			<ServiceErrorModal visible featureName='autoryzacja aplikacji' onClose={onClose} />
		);
		const modal = findByType(tree, 'Modal')[0];
		const dismissButton = findByType(tree, 'Pressable')[0];

		expect(modal.props.visible).toBe(true);
		expect(modal.props.transparent).toBe(true);
		expect(modal.props.animationType).toBe('fade');
		expect(modal.props.onRequestClose).toBe(onClose);
		expect(findByText(tree, 'autoryzacja aplikacji')).toBeTruthy();

		dismissButton.props.onPress();
		expect(onClose).toHaveBeenCalled();
	});

	test('hides close handlers when not dismissible', () => {
		const tree = (
			<ServiceErrorModal
				visible
				featureName='konfiguracja aplikacji'
				onClose={jest.fn()}
				dismissible={false}
			/>
		);

		expect(findByType(tree, 'Modal')[0].props.onRequestClose).toBeUndefined();
		expect(findByType(tree, 'Pressable')).toHaveLength(0);
	});
});

describe('AvailableFilesList', () => {
	test('renders loading state with title and spinner', () => {
		const tree = (
			<AvailableFilesList files={[]} variant='grid' isLoading onOpenFile={jest.fn()} />
		);

		expect(findByText(tree, 'WSZYSTKIE PLIKI')).toBeTruthy();
		expect(findByType(tree, 'ActivityIndicator')).toHaveLength(1);
		expect(getTextContent(tree)).toContain('Ładowanie plików...');
	});

	test('renders empty state', () => {
		const tree = <AvailableFilesList files={[]} variant='list' onOpenFile={jest.fn()} />;

		expect(getTextContent(tree)).toContain('Brak plików do wyświetlenia.');
	});

	test('opens a file from list variant', () => {
		const onOpenFile = jest.fn();
		const tree = <AvailableFilesList files={files} variant='list' onOpenFile={onOpenFile} />;
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[1].props.onPress();

		expect(getTextContent(tree)).toContain('Manual.pdf');
		expect(getTextContent(tree)).toContain('Schemat.pdf');
		expect(onOpenFile).toHaveBeenCalledWith(files[1]);
	});

	test('shows delete control for downloaded grid files', () => {
		const onOpenFile = jest.fn();
		const onDeleteDownloadedFile = jest.fn();
		const tree = (
			<AvailableFilesList
				files={[files[0]]}
				variant='grid'
				downloadedFileIds={new Set([1])}
				onOpenFile={onOpenFile}
				onDeleteDownloadedFile={onDeleteDownloadedFile}
			/>
		);
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[0].props.onPress();
		buttons[1].props.onPress();

		expect(buttons).toHaveLength(2);
		expect(onOpenFile).toHaveBeenCalledWith(files[0]);
		expect(onDeleteDownloadedFile).toHaveBeenCalledWith(files[0]);
		expect(findByType(tree, 'ActivityIndicator')).toHaveLength(0);
	});

	test('disables grid items and shows spinner for active download', () => {
		const tree = (
			<AvailableFilesList
				files={[files[0]]}
				variant='grid'
				isFileDownloading
				downloadingFileId={1}
				onOpenFile={jest.fn()}
			/>
		);

		expect(findByType(tree, 'TouchableOpacity')[0].props.disabled).toBe(true);
		expect(findByType(tree, 'ActivityIndicator')).toHaveLength(1);
	});
});

describe('StartPromptView', () => {
	const createProps = () => ({
		height: 800,
		keyboardFrame: null,
		inputText: 'test',
		inputRef: { current: null },
		hasStartedChat: false,
		shouldFocusInput: false,
		onChangeText: jest.fn(),
		onSend: jest.fn(),
		onShowTextInputChange: jest.fn(),
		onShouldFocusStartPromptInputChange: jest.fn(),
	});

	test('wires input focus, blur, text change, and submit callbacks', () => {
		const focus = jest.fn();
		const props = { ...createProps(), inputRef: { current: { focus } } as never };
		const tree = <StartPromptView {...props} />;
		const input = findByType(tree, 'TextInput')[0];
		const inputContainer = findByType(tree, 'Pressable')[0];
		const sendButton = findByType(tree, 'TouchableOpacity')[0];

		inputContainer.props.onPress();
		input.props.onPressIn();
		input.props.onFocus();
		input.props.onChangeText('nowe pytanie');
		input.props.onSubmitEditing();
		input.props.onBlur();
		sendButton.props.onPress();

		expect(input.props.value).toBe('test');
		expect(input.props.style).toEqual(expect.objectContaining({ height: '100%' }));
		expect(inputContainer.props.hitSlop).toEqual({
			top: 12,
			right: 8,
			bottom: 12,
			left: 8,
		});
		expect(focus).toHaveBeenCalledTimes(1);
		expect(props.onShowTextInputChange).toHaveBeenNthCalledWith(1, true);
		expect(props.onShowTextInputChange).toHaveBeenNthCalledWith(2, true);
		expect(props.onShouldFocusStartPromptInputChange).toHaveBeenCalledWith(false);
		expect(props.onChangeText).toHaveBeenCalledWith('nowe pytanie');
		expect(props.onSend).toHaveBeenCalledTimes(2);
		expect(props.onShowTextInputChange).toHaveBeenLastCalledWith(false);
	});

	test('selects quick prompts and hides text input', () => {
		const props = createProps();
		const tree = <StartPromptView {...props} />;
		const quickPromptButtons = findByType(tree, 'TouchableOpacity').slice(1);

		quickPromptButtons[0].props.onPress();

		expect(props.onChangeText).toHaveBeenCalledWith('Nie działa podnoszenie wideł');
		expect(props.onShowTextInputChange).toHaveBeenCalledWith(false);
	});

	test('keeps one input mounted without retriggering autofocus for the keyboard layout', () => {
		const props = createProps();
		const tree = (
			<StartPromptView {...props} keyboardFrame={{ screenY: 500, height: 300 }} compact />
		);
		const inputs = findByType(tree, 'TextInput');

		expect(inputs).toHaveLength(1);
		expect(inputs[0].props.autoFocus).toBe(false);
		expect(findByText(tree, 'Jak mogę pomóc?')).toBeTruthy();
	});

	test('focuses the start input only once when writing mode is opened', () => {
		const focus = jest.fn();
		const props = {
			...createProps(),
			shouldFocusInput: true,
			inputRef: { current: { focus, isFocused: () => false } } as never,
		};

		const tree = <StartPromptView {...props} />;
		const input = findByType(tree, 'TextInput')[0];

		expect(focus).toHaveBeenCalledTimes(1);
		expect(input.props.autoFocus).toBe(false);
	});

	test.each([
		{
			name: 'phone portrait',
			compact: true,
			screen: { width: 583, height: 1289 },
			containerHeight: 1142,
			contentLayout: { y: 100, height: 650 },
			inputLayout: { y: 165, height: 74 },
			keyboardFrame: { screenY: 805, height: 484 },
			expectedTranslateY: 307,
		},
		{
			name: 'tablet portrait',
			compact: true,
			screen: { width: 800, height: 1200 },
			containerHeight: 1100,
			contentLayout: { y: 200, height: 700 },
			inputLayout: { y: 450, height: 74 },
			keyboardFrame: { screenY: 700, height: 500 },
			expectedTranslateY: -136,
		},
		{
			name: 'phone and tablet landscape',
			compact: false,
			screen: { width: 1280, height: 600 },
			containerHeight: 524,
			contentLayout: { y: 30, height: 360 },
			inputLayout: { y: 180, height: 74 },
			keyboardFrame: { screenY: 300, height: 300 },
			expectedTranslateY: -72,
		},
	])(
		'snaps the whole start screen above the keyboard on $name without animation',
		({
			compact,
			screen,
			containerHeight,
			contentLayout,
			inputLayout,
			keyboardFrame,
			expectedTranslateY,
		}) => {
			mockScreenDimensions = screen;
			mockReactStateValues = [0, true, containerHeight, contentLayout, inputLayout];

			const elements = collectElements(
				<StartPromptView
					{...createProps()}
					compact={compact}
					height={screen.height}
					keyboardFrame={keyboardFrame}
				/>,
			);
			const positionedContent = elements.find(
				(element) =>
					element.type === 'View' &&
					Array.isArray(element.props.style) &&
					element.props.style[1]?.transform,
			);

			expect(positionedContent?.props.style[1]).toEqual({
				transform: [{ translateY: expectedTranslateY }],
			});
			expect(elements.some((element) => element.type === 'Reanimated.View')).toBe(false);
		},
	);

	test('uses animated placeholder without focus and native placeholder with focus', () => {
		const props = { ...createProps(), inputText: '' };
		const idleTree = <StartPromptView {...props} />;
		const idleElements = collectElements(idleTree);

		expect(idleElements.filter((element) => element.type === 'Animated.Text')).toHaveLength(1);
		expect(
			idleElements.find((element) => element.type === 'TextInput')?.props.placeholder,
		).toBe('');

		mockReactStateValues = [0, true];
		mockReactStateIndex = 0;
		const focusedTree = <StartPromptView {...props} />;
		const focusedElements = collectElements(focusedTree);

		expect(focusedElements.filter((element) => element.type === 'Animated.Text')).toHaveLength(
			0,
		);
		expect(
			focusedElements.find((element) => element.type === 'TextInput')?.props.placeholder,
		).toBe('Np. co oznacza błąd 2:101?');
	});
});
