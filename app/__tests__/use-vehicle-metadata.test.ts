let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;

jest.mock('react', () => ({
	useEffect: (callback: () => void | (() => void)) => callback(),
	useState: (initialValue: unknown) => {
		const index = mockReactStateIndex++;
		if (mockReactStateValues.length <= index) mockReactStateValues[index] = initialValue;
		const setState = (value: unknown) => {
			mockReactStateValues[index] =
				typeof value === 'function' ? value(mockReactStateValues[index]) : value;
		};
		return [mockReactStateValues[index], setState];
	},
}));
jest.mock('@/utils/api-config', () => ({
	API_URL: 'https://api.example.test',
	API_URL_CONFIG_ERROR: null,
}));
jest.mock('@/utils/auth-errors', () => ({
	getAuthTokenOrThrow: jest.fn(() => 'test-token'),
	getServiceErrorFeature: jest.fn((_error, fallback) => fallback),
	throwIfAuthResponseError: jest.fn(),
}));

import { useVehicleMetadata } from '../hooks/use-vehicle-metadata';

const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const renderHook = () => {
	mockReactStateIndex = 0;
	const onServiceError = jest.fn();
	return { result: useVehicleMetadata({ onServiceError }), onServiceError };
};

describe('useVehicleMetadata', () => {
	beforeEach(() => {
		mockReactStateValues = [];
		mockReactStateIndex = 0;
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});
	afterEach(() => jest.restoreAllMocks());

	test('loads the category tree and devices with auth headers', async () => {
		jest.mocked(global.fetch).mockImplementation((url) =>
			Promise.resolve(
				String(url).endsWith('/api/categories/tree')
					? response([{ id: 1, name: 'Toyota', children: [] }])
					: response([{ id: 3, category_id: 1, name: 'Toyota 8FG' }]),
			),
		);
		const { result, onServiceError } = renderHook();
		await flush();
		await flush();

		expect(result.categories).toEqual([]);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/categories/tree',
			expect.objectContaining({
				method: 'GET',
				headers: { Authorization: 'Bearer test-token', Accept: 'application/json' },
			}),
		);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/devices',
			expect.objectContaining({ method: 'GET' }),
		);
		expect(mockReactStateValues[0]).toEqual([{ id: 1, name: 'Toyota', children: [] }]);
		expect(mockReactStateValues[1]).toEqual([{ id: 3, category_id: 1, name: 'Toyota 8FG' }]);
		expect(mockReactStateValues.slice(2, 4)).toEqual([false, false]);
		expect(onServiceError).not.toHaveBeenCalled();
	});

	test('reports device loading errors with the device list feature name', async () => {
		jest.mocked(global.fetch).mockImplementation((url) =>
			String(url).endsWith('/api/devices')
				? Promise.reject(new Error('network down'))
				: Promise.resolve(response([])),
		);
		const { onServiceError } = renderHook();
		await flush();
		await flush();
		expect(onServiceError).toHaveBeenCalledWith('lista maszyn', expect.any(Error));
		expect(mockReactStateValues[3]).toBe(false);
	});
});
