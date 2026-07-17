import { fetchWithRetry, HttpError, isTransientNetworkError } from '../utils/network';

describe('network helpers', () => {
	beforeEach(() => {
		global.fetch = jest.fn();
	});

	test('classifies connection and temporary HTTP failures as transient', () => {
		expect(isTransientNetworkError(new TypeError('Network request failed'))).toBe(true);
		expect(isTransientNetworkError(new HttpError(503))).toBe(true);
		expect(isTransientNetworkError(new HttpError(401))).toBe(false);
	});

	test('retries a safe GET after a temporary connection failure', async () => {
		jest.mocked(global.fetch)
			.mockRejectedValueOnce(new TypeError('Network request failed'))
			.mockResolvedValueOnce(new Response('{}', { status: 200 }));

		const response = await fetchWithRetry(
			'https://api.example.test/data',
			{},
			{
				retryDelaysMs: [0],
			},
		);

		expect(response.status).toBe(200);
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	test('does not retry unsafe POST requests', async () => {
		jest.mocked(global.fetch).mockRejectedValue(new TypeError('Network request failed'));

		await expect(
			fetchWithRetry(
				'https://api.example.test/threads',
				{ method: 'POST' },
				{ retryDelaysMs: [0] },
			),
		).rejects.toThrow('Network request failed');
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});
});
