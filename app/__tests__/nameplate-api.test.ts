import type { NameplateDeviceCandidate } from '@/types/nameplate';

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

class FormDataMock {
	entries: Array<[string, unknown]> = [];

	append(name: string, value: unknown) {
		this.entries.push([name, value]);
	}
}

const loadApi = async () => {
	jest.resetModules();
	// jest.resetModules() gives token-store.ts a fresh module instance too, so
	// the cached token must be (re-)set against that same fresh instance
	// before nameplate-api.ts (which imports it transitively) reads it.
	const { __setCachedTokenForTests } = await import('../utils/token-store');
	__setCachedTokenForTests('test-token');
	return import('../utils/nameplate-api');
};

beforeEach(() => {
	process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test';
	global.fetch = jest.fn();
	(global as any).FormData = FormDataMock;
});

afterEach(() => {
	if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
	else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
	jest.resetModules();
});

test('recognizeNameplate uploads a photo with authorization', async () => {
	const recognition = {
		nameplate_data: {
			model: 'XXX1D1XXX',
			attributes: [],
			raw_text: 'MODEL XXX1D1XXX',
		},
		matched_device: null,
		candidates: [],
		requires_confirmation: true,
	};
	jest.mocked(global.fetch).mockResolvedValue({
		ok: true,
		json: async () => recognition,
	} as Response);
	const { recognizeNameplate } = await loadApi();

	await expect(recognizeNameplate('file:///nameplate.jpg')).resolves.toEqual(recognition);

	expect(global.fetch).toHaveBeenCalledWith(
		'https://api.example.test/api/nameplates/recognize',
		expect.objectContaining({
			method: 'POST',
			headers: {
				Accept: 'application/json',
				Authorization: 'Bearer test-token',
			},
		}),
	);
});

test('recognizeNameplate supports consecutive scans', async () => {
	const recognition = {
		nameplate_data: {
			model: '1D1',
			attributes: [],
			raw_text: 'MODEL 1D1',
		},
		matched_device: null,
		candidates: [],
		requires_confirmation: true,
	};
	jest.mocked(global.fetch).mockResolvedValue({
		ok: true,
		json: async () => recognition,
	} as Response);
	const { recognizeNameplate } = await loadApi();

	await recognizeNameplate('file:///first.jpg');
	await recognizeNameplate('file:///second.jpg');

	expect(global.fetch).toHaveBeenCalledTimes(2);
	expect(
		(jest.mocked(global.fetch).mock.calls[0][1]?.body as unknown as FormDataMock).entries,
	).toHaveLength(1);
	expect(
		(jest.mocked(global.fetch).mock.calls[1][1]?.body as unknown as FormDataMock).entries,
	).toHaveLength(1);
});

test('recognizeNameplate retries one transient network failure', async () => {
	jest.useFakeTimers();
	const recognition = {
		nameplate_data: {
			model: '1D1',
			attributes: [],
			raw_text: 'MODEL 1D1',
		},
		matched_device: null,
		candidates: [],
		requires_confirmation: true,
	};
	jest.mocked(global.fetch)
		.mockRejectedValueOnce(new TypeError('Network request failed'))
		.mockResolvedValueOnce({
			ok: true,
			json: async () => recognition,
		} as Response);
	const { recognizeNameplate } = await loadApi();

	const recognitionPromise = recognizeNameplate('file:///nameplate.jpg');
	await jest.advanceTimersByTimeAsync(750);

	await expect(recognitionPromise).resolves.toEqual(recognition);
	expect(global.fetch).toHaveBeenCalledTimes(2);
	jest.useRealTimers();
});

test('recognizeNameplate retries transient HTTP responses', async () => {
	jest.useFakeTimers();
	const recognition = {
		nameplate_data: {
			model: '1D1',
			attributes: [],
			raw_text: 'MODEL 1D1',
		},
		matched_device: null,
		candidates: [],
		requires_confirmation: true,
	};
	jest.mocked(global.fetch)
		.mockResolvedValueOnce({
			ok: false,
			status: 503,
		} as Response)
		.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => recognition,
		} as Response);
	const { recognizeNameplate } = await loadApi();

	const recognitionPromise = recognizeNameplate('file:///nameplate.jpg');
	await jest.advanceTimersByTimeAsync(750);

	await expect(recognitionPromise).resolves.toEqual(recognition);
	expect(global.fetch).toHaveBeenCalledTimes(2);
	jest.useRealTimers();
});

test('recognizeNameplate tolerates two consecutive connection failures', async () => {
	jest.useFakeTimers();
	const recognition = {
		nameplate_data: {
			model: '1D1',
			attributes: [],
			raw_text: 'MODEL 1D1',
		},
		matched_device: null,
		candidates: [],
		requires_confirmation: true,
	};
	jest.mocked(global.fetch)
		.mockRejectedValueOnce(new TypeError('Network request failed'))
		.mockRejectedValueOnce(new TypeError('Network request failed'))
		.mockResolvedValueOnce({
			ok: true,
			json: async () => recognition,
		} as Response);
	const { recognizeNameplate } = await loadApi();

	const recognitionPromise = recognizeNameplate('file:///nameplate.jpg');
	await jest.advanceTimersByTimeAsync(750);
	await jest.advanceTimersByTimeAsync(2_000);

	await expect(recognitionPromise).resolves.toEqual(recognition);
	expect(global.fetch).toHaveBeenCalledTimes(3);
	jest.useRealTimers();
});

test('recognizeNameplate includes backend error details', async () => {
	jest.mocked(global.fetch).mockResolvedValue({
		ok: false,
		status: 422,
		json: async () => ({ detail: 'No text was found on the nameplate' }),
	} as Response);
	const { recognizeNameplate } = await loadApi();

	await expect(recognizeNameplate('file:///nameplate.jpg')).rejects.toMatchObject({
		status: 422,
		message: 'Nameplate recognition failed (422): No text was found on the nameplate',
	});
});

test('recognizeNameplate does not repeat a long server-side OCR timeout', async () => {
	jest.mocked(global.fetch).mockResolvedValue({
		ok: false,
		status: 504,
		json: async () => ({ detail: 'OpenAI image recognition timed out after 90 seconds' }),
	} as Response);
	const { recognizeNameplate } = await loadApi();

	await expect(recognizeNameplate('file:///nameplate.jpg')).rejects.toMatchObject({
		status: 504,
	});
	expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('recognizeNameplate stops waiting after the OCR timeout', async () => {
	jest.useFakeTimers();
	jest.mocked(global.fetch).mockImplementation(
		(_input, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					const error = new Error('Aborted');
					error.name = 'AbortError';
					reject(error);
				});
			}),
	);
	const { recognizeNameplate } = await loadApi();

	const recognitionPromise = recognizeNameplate('file:///nameplate.jpg');
	const rejection = expect(recognitionPromise).rejects.toMatchObject({
		status: 408,
		message: 'Nameplate request timed out',
	});
	await jest.advanceTimersByTimeAsync(30_000);

	await rejection;
	jest.useRealTimers();
});

test('createNameplateThread stores OCR data and selected device', async () => {
	jest.mocked(global.fetch).mockResolvedValue({
		ok: true,
		json: async () => ({ id: 44, device_id: 7, title: 'Tabliczka: XXX1D1XXX' }),
	} as Response);
	const { createNameplateThread } = await loadApi();
	const device: NameplateDeviceCandidate = {
		id: 7,
		name: '1D1',
		model_serial_code: '1D1',
		score: 0.94,
		matched_identifier: '1D1',
	};

	await createNameplateThread({
		device,
		nameplateData: {
			model: 'XXX1D1XXX',
			attributes: [{ label: 'Numer seryjny', value: '558123' }],
			raw_text: 'MODEL XXX1D1XXX',
		},
	});

	const request = jest.mocked(global.fetch).mock.calls[0][1] as RequestInit;
	expect(global.fetch).toHaveBeenCalledWith(
		'https://api.example.test/api/threads',
		expect.objectContaining({ method: 'POST' }),
	);
	expect(JSON.parse(String(request.body))).toMatchObject({
		device_id: 7,
		nameplate_data: {
			model: 'XXX1D1XXX',
			match_confidence: 0.94,
		},
	});
});
