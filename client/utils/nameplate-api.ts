import type {
	ChatThreadWithNameplate,
	NameplateData,
	NameplateDeviceCandidate,
	NameplateRecognition,
} from '@/types/nameplate';
import { AUTH_URL, AUTH_URL_CONFIG_ERROR } from '@/utils/api-config';
import { getAuthTokenOrThrow, throwIfAuthResponseError } from '@/utils/auth-errors';
import { HttpError } from '@/utils/network';

const OCR_TIMEOUT_MS = 70_000;
const THREAD_TIMEOUT_MS = 20_000;
const NETWORK_RETRY_DELAY_MS = 750;

const jsonHeaders = (authToken: string) => ({
	Accept: 'application/json',
	Authorization: `Bearer ${authToken}`,
	'Content-Type': 'application/json',
});

const readErrorDetail = async (response: Response): Promise<string | null> => {
	try {
		const payload = (await response.json()) as {
			detail?: string | Array<{ msg?: string }>;
		};
		if (typeof payload.detail === 'string' && payload.detail.trim()) {
			return payload.detail.trim();
		}
		if (Array.isArray(payload.detail)) {
			const messages = payload.detail
				.map((item) => item?.msg?.trim())
				.filter((message): message is string => Boolean(message));
			return messages.length > 0 ? messages.join('; ') : null;
		}
	} catch {
		// Some upstream failures do not return a JSON response.
	}
	return null;
};

const fetchWithTimeout = async (
	input: RequestInfo | URL,
	init: RequestInit,
	timeoutMs: number,
	externalSignal?: AbortSignal,
) => {
	const controller = new AbortController();
	let didTimeout = false;
	const abortFromExternalSignal = () => controller.abort();

	if (externalSignal?.aborted) {
		controller.abort();
	} else {
		externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
	}
	const timeout = setTimeout(() => {
		didTimeout = true;
		controller.abort();
	}, timeoutMs);

	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} catch (error) {
		if (didTimeout) {
			throw new HttpError(408, 'Nameplate request timed out');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
		externalSignal?.removeEventListener('abort', abortFromExternalSignal);
	}
};

const waitForNetworkRetry = (signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			const error = new Error('The operation was aborted.');
			error.name = 'AbortError';
			reject(error);
			return;
		}

		const handleAbort = () => {
			clearTimeout(timeout);
			const error = new Error('The operation was aborted.');
			error.name = 'AbortError';
			reject(error);
		};
		const timeout = setTimeout(() => {
			signal?.removeEventListener('abort', handleAbort);
			resolve();
		}, NETWORK_RETRY_DELAY_MS);
		signal?.addEventListener('abort', handleAbort, { once: true });
	});

export const recognizeNameplate = async (
	photoUri: string,
	signal?: AbortSignal,
): Promise<NameplateRecognition> => {
	if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
	const authToken = getAuthTokenOrThrow();
	const sendPhoto = () => {
		const formData = new FormData();
		formData.append('photo', {
			uri: photoUri,
			name: 'nameplate.jpg',
			type: 'image/jpeg',
		} as unknown as Blob);

		return fetchWithTimeout(
			`${AUTH_URL}/api/nameplates/recognize`,
			{
				method: 'POST',
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${authToken}`,
				},
				body: formData,
			},
			OCR_TIMEOUT_MS,
			signal,
		);
	};

	let response: Response;
	try {
		response = await sendPhoto();
	} catch (error) {
		if (!(error instanceof TypeError) || signal?.aborted) throw error;
		await waitForNetworkRetry(signal);
		response = await sendPhoto();
	}
	if (!response.ok) {
		throwIfAuthResponseError(response);
		const detail = await readErrorDetail(response);
		throw new HttpError(
			response.status,
			detail
				? `Nameplate recognition failed (${response.status}): ${detail}`
				: `Nameplate recognition failed: ${response.status}`,
		);
	}
	return (await response.json()) as NameplateRecognition;
};

export const createNameplateThread = async ({
	device,
	nameplateData,
	signal,
}: {
	device: NameplateDeviceCandidate;
	nameplateData: NameplateData;
	signal?: AbortSignal;
}): Promise<ChatThreadWithNameplate> => {
	if (AUTH_URL_CONFIG_ERROR) throw AUTH_URL_CONFIG_ERROR;
	const authToken = getAuthTokenOrThrow();
	const response = await fetchWithTimeout(
		`${AUTH_URL}/api/threads`,
		{
			method: 'POST',
			headers: jsonHeaders(authToken),
			body: JSON.stringify({
				device_id: device.id,
				title: `Tabliczka: ${nameplateData.model}`.slice(0, 80),
				nameplate_data: {
					...nameplateData,
					match_confidence: device.score,
				},
			}),
		},
		THREAD_TIMEOUT_MS,
		signal,
	);
	if (!response.ok) {
		throwIfAuthResponseError(response);
		throw new HttpError(response.status, `Thread creation failed: ${response.status}`);
	}
	return (await response.json()) as ChatThreadWithNameplate;
};
