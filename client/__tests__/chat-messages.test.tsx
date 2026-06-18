import React from 'react';

import type { ChatMessageItem } from '@/components/ChatMessages';
import ChatMessages, { stripResponseDirectivesForSpeech } from '../components/ChatMessages';
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

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	const Icon = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Icon', props, children);

	return {
		Feather: Icon,
	};
});

describe('ChatMessages', () => {
	const baseProps = {
		compact: false,
		isListening: false,
		soundLevelAnim: new (jest.requireMock('react-native').Animated.Value)(0.2),
		schemaAspectRatio: 1.4,
		onOpenSchema: jest.fn(),
		onOpenSource: jest.fn(),
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

	test('renders local feedback controls only for completed assistant messages', () => {
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

		expect(feedbackIcons.map((icon) => icon.props.name)).toEqual(['thumbs-up', 'thumbs-down']);
		expect(findByText(tree, 'Czy ta odpowiedź była pomocna?')).toBeTruthy();
		expect(feedbackIcons.map((icon) => icon.props.color)).toEqual(['#8F959E', '#8F959E']);
		expect(feedbackButtons).toHaveLength(2);
		expect(feedbackButtons.every((button) => button.props.accessibilityRole === 'button')).toBe(
			true,
		);
		feedbackButtons.forEach((button) => button.props.onPress());
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
		const sourceMessage: ChatMessageItem = {
			id: 1,
			sender: 'ai',
			text: 'Zobacz źródło.',
			schemaImage: 'data:image/png;base64,abc',
			sourceAttachmentId: 88,
			sourceAttachmentName: 'manual.pdf',
			sourceAttachmentPage: 3,
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

		buttons[0].props.onPress();
		buttons[1].props.onPress();

		expect(findByText(tree, 'Schemat pomocniczy')).toBeTruthy();
		expect(findByText(tree, 'POKAŻ ŹRÓDŁO ODPOWIEDZI')).toBeTruthy();
		expect(onOpenSchema).toHaveBeenCalledWith('data:image/png;base64,abc');
		expect(onOpenSource).toHaveBeenCalledWith(sourceMessage);
	});
});
