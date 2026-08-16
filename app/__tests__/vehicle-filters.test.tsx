import React from 'react';
import VehicleFilters from '../components/vehicles/VehicleFilters';
import type { Category } from '../hooks/use-vehicle-metadata';
import { findByType, getTextContent } from '../test-utils/react-tree';

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');
	return { ...actualReact, useState: (initialValue: unknown) => [initialValue, jest.fn()] };
});
jest.mock('react-native', () => {
	const React = require('react');
	const host = (name: string) =>
		function Host({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};
	return {
		ActivityIndicator: host('ActivityIndicator'),
		Image: host('Image'),
		Platform: { OS: 'ios' },
		ScrollView: host('ScrollView'),
		Text: host('Text'),
		TouchableOpacity: host('TouchableOpacity'),
		View: host('View'),
	};
});

const category = (
	id: number,
	name: string,
	children: Category[] = [],
	parentId: number | null = null,
): Category => ({
	id,
	name,
	image_url: null,
	parent_id: parentId,
	created_at: '',
	updated_at: '',
	children,
});

describe('VehicleFilters', () => {
	test('renders root categories and the selected branch children', () => {
		const tree = (
			<VehicleFilters
				categories={[
					category(1, 'Toyota', [category(3, 'Wózek', [], 1)]),
					category(2, 'Still'),
				]}
				selectedCategoryIds={[1]}
				onCategoryPathChange={jest.fn()}
				useCompactLayout={false}
			/>
		);
		const text = getTextContent(tree);
		expect(text).toContain('Marka');
		expect(text).toContain('Toyota');
		expect(text).toContain('Still');
		expect(text).toContain('Typ maszyny');
		expect(text).toContain('Wózek');
	});

	test('builds and truncates the selected category path', () => {
		const onChange = jest.fn();
		const tree = (
			<VehicleFilters
				categories={[category(1, 'Toyota', [category(3, 'Wózek', [], 1)])]}
				selectedCategoryIds={[1]}
				onCategoryPathChange={onChange}
				useCompactLayout={false}
			/>
		);
		const buttons = findByType(tree, 'TouchableOpacity');
		buttons[3].props.onPress();
		expect(onChange).toHaveBeenCalledWith([1, 3]);
		buttons[2].props.onPress();
		expect(onChange).toHaveBeenCalledWith([1]);
	});

	test('shows one loading indicator for the category tree', () => {
		const tree = (
			<VehicleFilters
				categories={[]}
				selectedCategoryIds={[]}
				onCategoryPathChange={jest.fn()}
				useCompactLayout={false}
				isLoading
			/>
		);
		expect(findByType(tree, 'ActivityIndicator')).toHaveLength(1);
	});

	test('keeps long category buttons at their full width', () => {
		const tree = (
			<VehicleFilters
				categories={[category(1, 'Wózki paletowe niskiego składowania')]}
				selectedCategoryIds={[]}
				onCategoryPathChange={jest.fn()}
				useCompactLayout={false}
			/>
		);
		const longButton = findByType(tree, 'TouchableOpacity')[1];
		const longText = findByType(longButton, 'Text')[0];
		expect(longButton.props.style).toEqual(
			expect.arrayContaining([expect.objectContaining({ flexShrink: 0 })]),
		);
		expect(longText.props.style).toEqual(
			expect.arrayContaining([expect.objectContaining({ flexShrink: 0 })]),
		);
		expect(longText.props.numberOfLines).toBe(1);
	});
});
