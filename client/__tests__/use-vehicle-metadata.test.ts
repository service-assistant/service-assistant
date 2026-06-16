let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;

jest.mock('react', () => ({
	useEffect: (callback: () => void | (() => void)) => {
		callback();
	},
	useState: (initialValue: unknown) => {
		const stateIndex = mockReactStateIndex;
		mockReactStateIndex += 1;

		if (mockReactStateValues.length <= stateIndex) {
			mockReactStateValues[stateIndex] =
				typeof initialValue === 'function' ? initialValue() : initialValue;
		}

		const setState = (value: unknown) => {
			mockReactStateValues[stateIndex] =
				typeof value === 'function' ? value(mockReactStateValues[stateIndex]) : value;
		};

		return [mockReactStateValues[stateIndex], setState];
	},
}));

jest.mock('@/utils/api-config', () => ({
	AUTH_URL: 'https://api.example.test',
	AUTH_URL_CONFIG_ERROR: null,
}));

jest.mock('@/utils/auth-errors', () => ({
	getAuthTokenOrThrow: jest.fn(() => 'test-token'),
	getServiceErrorFeature: jest.fn((_error, fallback) => fallback),
	throwIfAuthResponseError: jest.fn(),
}));

import { useVehicleMetadata } from '../hooks/use-vehicle-metadata';

const createJsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const renderHook = () => {
	mockReactStateIndex = 0;
	const onServiceError = jest.fn();
	const result = useVehicleMetadata({ onServiceError });

	return { result, onServiceError };
};

describe('useVehicleMetadata', () => {
	beforeEach(() => {
		mockReactStateValues = [];
		mockReactStateIndex = 0;
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('loads brands, device types, and devices with auth headers', async () => {
		jest.mocked(global.fetch).mockImplementation((url) => {
			const requestUrl = String(url);

			if (requestUrl.endsWith('/api/brands')) {
				return Promise.resolve(createJsonResponse([{ id: 1, name: 'Toyota' }]));
			}
			if (requestUrl.endsWith('/api/device_types')) {
				return Promise.resolve(createJsonResponse([{ id: 2, name: 'Wózek' }]));
			}
			return Promise.resolve(
				createJsonResponse([{ id: 3, brand_id: 1, device_type_id: 2, name: 'Toyota 8FG' }]),
			);
		});

		const { result, onServiceError } = renderHook();
		await flushPromises();
		await flushPromises();

		expect(result.brands).toEqual([]);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/brands',
			expect.objectContaining({
				method: 'GET',
				headers: {
					Authorization: 'Bearer test-token',
					Accept: 'application/json',
				},
			}),
		);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/device_types',
			expect.objectContaining({ method: 'GET' }),
		);
		expect(global.fetch).toHaveBeenCalledWith(
			'https://api.example.test/api/devices',
			expect.objectContaining({ method: 'GET' }),
		);
		expect(mockReactStateValues[0]).toEqual([{ id: 1, name: 'Toyota' }]);
		expect(mockReactStateValues[1]).toEqual([{ id: 2, name: 'Wózek' }]);
		expect(mockReactStateValues[2]).toEqual([
			{ id: 3, brand_id: 1, device_type_id: 2, name: 'Toyota 8FG' },
		]);
		expect(mockReactStateValues.slice(3, 6)).toEqual([false, false, false]);
		expect(onServiceError).not.toHaveBeenCalled();
	});

	test('reports device loading errors with the device list feature name', async () => {
		jest.mocked(global.fetch).mockImplementation((url) => {
			const requestUrl = String(url);

			if (requestUrl.endsWith('/api/devices')) {
				return Promise.reject(new Error('network down'));
			}
			return Promise.resolve(createJsonResponse([]));
		});

		const { onServiceError } = renderHook();
		await flushPromises();
		await flushPromises();

		expect(onServiceError).toHaveBeenCalledWith('lista maszyn', expect.any(Error));
		expect(mockReactStateValues[5]).toBe(false);
	});
});
