import React from 'react';

import type { ChatMessageItem } from '@/components/ChatMessages';
import ChatMessages, {
	clampSchemaTranslation,
	getFocalSchemaTranslation,
	stripResponseDirectivesForSpeech,
} from '../components/ChatMessages';
import { findByText, findByType, getTextContent } from '../test-utils/react-tree';

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');
	return {
		...actualReact,
		useEffect: () => undefined,
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

	const AnimatedView = createHost('Animated.View');
	const Value = jest.fn(() => ({
		interpolate: jest.fn(() => 'interpolated'),
		setValue: jest.fn(),
	}));

	return {
		Animated: {
			View: AnimatedView,
			Value,
			loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
			timing: jest.fn(() => ({ start: jest.fn() })),
		},
		Image: createHost('Image'),
		Platform: { OS: 'ios' },
		Text: createHost('Text'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
	};
});

jest.mock('react-native-webview', () => {
	const React = require('react');
	return {
		WebView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('WebView', props, children),
	};
});

jest.mock('react-native-gesture-handler', () => {
	const React = require('react');
	const createGesture = () => {
		const gesture: Record<string, jest.Mock> = {};
		gesture.maxPointers = jest.fn(() => gesture);
		gesture.numberOfTaps = jest.fn(() => gesture);
		gesture.onEnd = jest.fn(() => gesture);
		gesture.onStart = jest.fn(() => gesture);
		gesture.onTouchesCancelled = jest.fn(() => gesture);
		gesture.onTouchesDown = jest.fn(() => gesture);
		gesture.onTouchesMove = jest.fn(() => gesture);
		gesture.onTouchesUp = jest.fn(() => gesture);
		gesture.onUpdate = jest.fn(() => gesture);
		return gesture;
	};

	return {
		Gesture: {
			Exclusive: jest.fn((...gestures) => gestures),
			Manual: createGesture,
			Pan: createGesture,
			Pinch: createGesture,
			Race: jest.fn((...gestures) => gestures),
			Simultaneous: jest.fn((...gestures) => gestures),
			Tap: createGesture,
		},
		GestureDetector: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('GestureDetector', props, children),
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
	const Icon = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Icon', props, children);

	return {
		Feather: Icon,
		MaterialCommunityIcons: Icon,
	};
});

describe('ChatMessages', () => {
	test('keeps a zoomed schema within the viewport bounds', () => {
		expect(clampSchemaTranslation(1000, 800, 2)).toBe(400);
		expect(clampSchemaTranslation(-1000, 800, 2)).toBe(-400);
		expect(clampSchemaTranslation(50, 800, 2)).toBe(50);
		expect(clampSchemaTranslation(100, 800, 1)).toBe(0);
	});

	test('keeps the point between the fingers anchored while zooming', () => {
		expect(getFocalSchemaTranslation(0, 150, 150, 2)).toBe(-150);
		expect(getFocalSchemaTranslation(-100, 150, 200, 1.5)).toBe(-175);
	});

	const baseProps = {
		compact: false,
		isListening: false,
		soundLevelAnim: new (jest.requireMock('react-native').Animated.Value)(0.2),
		onOpenSchema: jest.fn(),
		onOpenSource: jest.fn(),
		onRetryMessage: jest.fn(),
		onUserMessageLayout: jest.fn(),
	};

	test('strips response directives for speech', () => {
		expect(
			stripResponseDirectivesForSpeech(
				'Intro\n::checklist - check oil\n- check battery\n::warning stop',
			),
		).toBe('Intro\ncheck oil\ncheck battery\nstop');
	});

	test('renders user and assistant text messages', () => {
		const messages: ChatMessageItem[] = [
			{ id: 1, sender: 'user', text: 'Jak sprawdzić olej?' },
			{ id: 2, sender: 'ai', text: 'Sprawdź bagnet przy zimnym silniku.' },
		];
		const tree = <ChatMessages {...baseProps} messages={messages} />;

		expect(getTextContent(tree)).toContain('Jak sprawdzić olej?');
		expect(getTextContent(tree)).toContain('Sprawdź bagnet przy zimnym silniku.');
	});

	test('renders a typing indicator for empty assistant messages', () => {
		const tree = <ChatMessages {...baseProps} messages={[{ id: 1, sender: 'ai', text: '' }]} />;

		expect(findByType(tree, 'Animated.View').length).toBeGreaterThanOrEqual(3);
		expect(findByType(tree, 'Icon').some((icon) => icon.props.name === 'thumbs-up')).toBe(
			false,
		);
	});

	test('reports the rendered position of a user message', () => {
		const onUserMessageLayout = jest.fn();
		const userMessage: ChatMessageItem = { id: 1, sender: 'user', text: 'Nowe pytanie' };
		const tree = (
			<ChatMessages
				{...baseProps}
				messages={[userMessage]}
				onUserMessageLayout={onUserMessageLayout}
			/>
		);
		const userBubble = findByType(tree, 'View').find(
			(view) => view.props.onLayout && getTextContent(view).includes('Nowe pytanie'),
		);

		userBubble?.props.onLayout({ nativeEvent: { layout: { y: 240 } } });
		expect(onUserMessageLayout).toHaveBeenCalledWith(userMessage, 240);
	});

	test('renders retry action for an interrupted answer', () => {
		const onRetryMessage = jest.fn();
		const interruptedMessage: ChatMessageItem = {
			id: 2,
			sender: 'ai',
			text: 'Połączenie zostało przerwane.',
			retryQuestion: 'Jak sprawdzić olej?',
		};
		const tree = (
			<ChatMessages
				{...baseProps}
				messages={[interruptedMessage]}
				onRetryMessage={onRetryMessage}
			/>
		);
		const retryButton = findByType(tree, 'TouchableOpacity').find(
			(button) => button.props.accessibilityLabel === 'Wyślij pytanie ponownie',
		);

		expect(findByText(tree, 'WYŚLIJ PONOWNIE')).toBeTruthy();
		expect(findByText(tree, 'Czy ta odpowiedź była pomocna?')).toBeFalsy();
		retryButton?.props.onPress();
		expect(onRetryMessage).toHaveBeenCalledWith(interruptedMessage);
	});

	test('does not render feedback controls for completed assistant messages', () => {
		const tree = (
			<ChatMessages
				{...baseProps}
				messages={[
					{ id: 1, sender: 'user', text: 'Pytanie' },
					{ id: 2, sender: 'ai', text: 'Odpowiedź' },
				]}
			/>
		);
		const feedbackIcons = findByType(tree, 'Icon').filter((icon) =>
			['thumbs-up', 'thumbs-down'].includes(icon.props.name),
		);
		const feedbackButtons = findByType(tree, 'TouchableOpacity').filter((button) =>
			['Lubię tę odpowiedź', 'Nie lubię tej odpowiedzi'].includes(
				button.props.accessibilityLabel,
			),
		);

		expect(feedbackIcons).toHaveLength(0);
		expect(findByText(tree, 'Czy ta odpowiedź była pomocna?')).toBeFalsy();
		expect(feedbackButtons).toHaveLength(0);
	});

	test('renders structured assistant directives', () => {
		const tree = (
			<ChatMessages
				{...baseProps}
				messages={[
					{
						id: 1,
						sender: 'ai',
						text: 'Plan\n::checklist - Sprawdź olej - Sprawdź przewody\n::warning Nie dotykaj gorących elementów\n::next Uruchom test',
					},
				]}
			/>
		);

		expect(getTextContent(tree)).toContain('Plan');
		expect(getTextContent(tree)).toContain('Sprawdź olej');
		expect(getTextContent(tree)).toContain('Sprawdź przewody');
		expect(getTextContent(tree)).toContain('Nie dotykaj gorących elementów');
		expect(getTextContent(tree)).toContain('Uruchom test');
		expect(findByType(tree, 'Icon').some((icon) => icon.props.name === 'alert-triangle')).toBe(
			true,
		);
		expect(findByType(tree, 'Icon').some((icon) => icon.props.name === 'arrow-right')).toBe(
			true,
		);
	});

	test('opens schema previews and answer sources', () => {
		const onOpenSchema = jest.fn();
		const onOpenSource = jest.fn();
		const sourceReferences = Array.from({ length: 6 }, (_, index) => ({
			sourceAttachmentId: 88,
			sourceAttachmentName: 'manual.pdf',
			sourceAttachmentPage: index + 1,
			previewImage: `data:image/png;base64,source-${index}`,
		}));
		const sourceMessage: ChatMessageItem = {
			id: 1,
			sender: 'ai',
			text: 'Zobacz źródło.',
			schemaImage: 'data:image/png;base64,abc',
			schemaImages: [
				'data:image/png;base64,abc',
				'data:image/png;base64,def',
				'data:image/png;base64,ghi',
				'data:image/png;base64,jkl',
				'data:image/png;base64,mno',
				'data:image/png;base64,ignored',
			],
			sourceAttachmentId: 88,
			sourceAttachmentName: 'manual.pdf',
			sourceAttachmentPage: 3,
			sourceReferences,
		};
		const tree = (
			<ChatMessages
				{...baseProps}
				messages={[sourceMessage]}
				onOpenSchema={onOpenSchema}
				onOpenSource={onOpenSource}
			/>
		);
		const buttons = findByType(tree, 'TouchableOpacity');
		const schemaButtons = buttons.filter((button) =>
			button.props.accessibilityLabel?.startsWith('Powiększ schemat'),
		);
		const sourceButtons = buttons.filter((button) =>
			button.props.accessibilityLabel?.startsWith('Otwórz źródło'),
		);

		schemaButtons[0].props.onPress();
		sourceButtons.forEach((button) => button.props.onPress());

		expect(findByText(tree, 'Schematy z dokumentacji')).toBeTruthy();
		expect(
			findByText(tree, 'Kliknij schemat, aby otworzyć go w pełnym rozmiarze.'),
		).toBeTruthy();
		expect(findByText(tree, 'manual.pdf')).toBeTruthy();
		expect(schemaButtons).toHaveLength(5);
		expect(sourceButtons).toHaveLength(5);
		expect(findByType(tree, 'WebView')).toHaveLength(0);
		expect(findByType(tree, 'Image')).toHaveLength(5);
		expect(onOpenSchema).toHaveBeenCalledWith('data:image/png;base64,abc');
		expect(onOpenSource).toHaveBeenCalledTimes(5);
		expect(onOpenSource.mock.calls.map(([source]) => source)).toEqual(
			sourceReferences.slice(0, 5),
		);
	});
});
