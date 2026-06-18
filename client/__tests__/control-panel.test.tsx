import React from 'react';

import ControlPanel from '../components/ControlPanel';
import { findByType, getTextContent } from '../test-utils/react-tree';

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');
	return {
		...actualReact,
		useEffect: (callback: () => void | (() => void)) => callback(),
		useRef: (initialValue: unknown) => ({ current: initialValue }),
	};
});

jest.mock('react-native', () => {
	const React = require('react');
	const createHost = (name: string) =>
		function HostComponent({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};

	return {
		Animated: {
			View: createHost('Animated.View'),
			Value: jest.fn(() => 'animated-value'),
			loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
			parallel: jest.fn((animations) => animations),
			timing: jest.fn(() => ({ start: jest.fn() })),
		},
		Image: createHost('Image'),
		Platform: { OS: 'ios' },
		Text: createHost('Text'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
	};
});

jest.mock('expo-blur', () => {
	const React = require('react');
	return {
		BlurView: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('BlurView', props, children),
	};
});

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	return {
		MaterialCommunityIcons: ({ children, ...props }: Record<string, unknown>) =>
			React.createElement('Icon', props, children),
	};
});

const baseProps = {
	orientation: 'horizontal' as const,
	isListening: false,
	isMicProcessing: false,
	isMicRestartBlocked: false,
	isWritingActive: false,
	onMicPress: jest.fn(),
	onWritingPress: jest.fn(),
};

describe('ControlPanel', () => {
	beforeEach(() => {
		baseProps.onMicPress.mockClear();
		baseProps.onWritingPress.mockClear();
	});

	test('renders horizontal controls and wires microphone and writing actions', () => {
		const tree = <ControlPanel {...baseProps} />;
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[1].props.onPress();
		buttons[2].props.onPress();

		expect(findByType(tree, 'BlurView')[0].props.tint).toBe('dark');
		expect(getTextContent(tree)).toContain('Naciśnij żeby mówić');
		expect(baseProps.onMicPress).toHaveBeenCalled();
		expect(baseProps.onWritingPress).toHaveBeenCalled();
	});

	test('uses a lightweight frosted backdrop for the phone edge-to-edge panel', () => {
		const tree = <ControlPanel {...baseProps} edgeToEdge />;
		const backdrop = findByType(tree, 'View').find(
			(view) => view.props.testID === 'control-panel-frosted-backdrop',
		);
		const haze = findByType(tree, 'View').find(
			(view) => view.props.testID === 'control-panel-frosted-haze',
		);

		expect(findByType(tree, 'BlurView')).toHaveLength(0);
		expect(backdrop?.props.style).toMatchObject({
			backgroundColor: 'rgba(12, 14, 20, 0.84)',
			bottom: -4,
		});
		expect(haze?.props.style).toMatchObject({
			backgroundColor: 'rgba(40, 48, 55, 0.25)',
		});
	});

	test('renders vertical controls with writing button first', () => {
		const tree = <ControlPanel {...baseProps} orientation='vertical' />;
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[0].props.onPress();
		buttons[1].props.onPress();

		expect(buttons).toHaveLength(3);
		expect(baseProps.onWritingPress).toHaveBeenCalled();
		expect(baseProps.onMicPress).toHaveBeenCalled();
		expect(getTextContent(tree)).toContain('Naciśnij, aby mówić');
	});

	test('shows listening pulse and label while listening', () => {
		const tree = <ControlPanel {...baseProps} isListening />;

		expect(getTextContent(tree)).toContain('Słucham...');
		expect(findByType(tree, 'Animated.View')).toHaveLength(1);
	});

	test('shows stop icon while processing', () => {
		const tree = <ControlPanel {...baseProps} isMicProcessing />;

		expect(getTextContent(tree)).toContain('Przetwarzam...');
		expect(findByType(tree, 'Icon').some((icon) => icon.props.name === 'stop')).toBe(true);
	});

	test('disables microphone while restart is blocked', () => {
		const tree = <ControlPanel {...baseProps} isMicRestartBlocked />;
		const micButton = findByType(tree, 'TouchableOpacity')[1];

		expect(micButton.props.disabled).toBe(true);
	});

	test('shows unavailable badges for speech input and voice output', () => {
		const tree = (
			<ControlPanel {...baseProps} isSpeechInputUnavailable isVoiceOutputUnavailable />
		);
		const iconNames = findByType(tree, 'Icon').map((icon) => icon.props.name);

		expect(getTextContent(tree)).toContain('Mowa niedostępna');
		expect(iconNames).toEqual(expect.arrayContaining(['microphone-off', 'volume-off']));
	});
});
