import React from 'react';

import { findByType, getTextContent } from '../test-utils/react-tree';
import VehicleFilters from '../components/VehicleFilters';

jest.mock('react', () => {
	const actualReact = jest.requireActual('react');

	return {
		...actualReact,
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
		ActivityIndicator: createHost('ActivityIndicator'),
		Image: createHost('Image'),
		Platform: {
			OS: 'ios',
		},
		ScrollView: createHost('ScrollView'),
		Text: createHost('Text'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
	};
});

describe('VehicleFilters', () => {
	test('renders brand and type options', () => {
		const tree = (
			<VehicleFilters
				brands={[
					{ name: 'Toyota', logo_url: null },
					{ name: 'Still', logo_url: null },
				]}
				deviceTypes={[{ name: 'Wózek' }]}
				activeBrandFilter='WSZYSTKIE'
				activeTypeFilter='WSZYSTKIE'
				onBrandFilterChange={jest.fn()}
				onTypeFilterChange={jest.fn()}
				useTabletRefresh={false}
			/>
		);

		const text = getTextContent(tree);

		expect(text).toContain('Marka');
		expect(text).toContain('Toyota'.toUpperCase());
		expect(text).toContain('Still'.toUpperCase());
		expect(text).toContain('Typ');
		expect(text).toContain('Wózek');
	});

	test('notifies when brand and type filters change', () => {
		const onBrandFilterChange = jest.fn();
		const onTypeFilterChange = jest.fn();
		const tree = (
			<VehicleFilters
				brands={[{ name: 'Toyota', logo_url: null }]}
				deviceTypes={[{ name: 'Wózek' }]}
				activeBrandFilter='WSZYSTKIE'
				activeTypeFilter='WSZYSTKIE'
				onBrandFilterChange={onBrandFilterChange}
				onTypeFilterChange={onTypeFilterChange}
				useTabletRefresh={false}
			/>
		);
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[1].props.onPress();
		buttons[3].props.onPress();

		expect(onBrandFilterChange).toHaveBeenCalledWith('Toyota');
		expect(onTypeFilterChange).toHaveBeenCalledWith('Wózek');
	});

	test('shows loading indicators for loading sections', () => {
		const tree = (
			<VehicleFilters
				brands={[]}
				deviceTypes={[]}
				activeBrandFilter='WSZYSTKIE'
				activeTypeFilter='WSZYSTKIE'
				onBrandFilterChange={jest.fn()}
				onTypeFilterChange={jest.fn()}
				useTabletRefresh={false}
				isLoadingBrands
				isLoadingTypes
			/>
		);

		expect(findByType(tree, 'ActivityIndicator')).toHaveLength(2);
	});
});
