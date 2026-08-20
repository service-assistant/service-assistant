import { API_URL } from '@/utils/api-config';
import { getAuthTokenOrThrow, throwIfAuthResponseError } from '@/utils/auth-errors';
import { fetchWithRetry, HttpError } from '@/utils/network';

/**
 * Centralized client for the plain JSON request/response call sites.
 *
 * Deliberately NOT used by every network call in the app: `use-chat-api.ts`
 * (SSE streaming), `use-source-panel-files.ts` (native FileSystem downloads,
 * authenticated PDF/image source URIs), and `use-microphone.ts` (WebSocket,
 * where the token travels as a query param, not a header) have shapes this
 * wrapper doesn't fit — forcing them through one generic function would be a
 * leaky abstraction. They already benefit from session-based auth via
 * `getAuthTokenOrThrow()` reading the stored session token instead of a
 * baked-in env var, so no separate migration was needed there.
 */

type ApiRequestInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

const buildUrl = (path: string) => `${API_URL}${path}`;

const authHeaders = (extra?: Record<string, string>): Record<string, string> => ({
	Authorization: `Bearer ${getAuthTokenOrThrow()}`,
	...extra,
});

export const apiFetch = async (path: string, init: ApiRequestInit = {}): Promise<Response> => {
	const response = await fetchWithRetry(buildUrl(path), {
		...init,
		headers: authHeaders(init.headers),
	});
	if (!response.ok) throwIfAuthResponseError(response);
	return response;
};

export const apiGetJson = async <T>(path: string, init: ApiRequestInit = {}): Promise<T> => {
	const response = await apiFetch(path, {
		...init,
		method: 'GET',
		headers: { Accept: 'application/json', ...init.headers },
	});
	if (!response.ok) {
		throw new HttpError(response.status, `HTTP request failed: ${response.status}`);
	}
	return (await response.json()) as T;
};

export const apiPostJson = async <T>(
	path: string,
	body: unknown,
	init: ApiRequestInit = {},
): Promise<T> => {
	const response = await apiFetch(path, {
		...init,
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...init.headers,
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new HttpError(response.status, `HTTP request failed: ${response.status}`);
	}
	return (await response.json()) as T;
};
