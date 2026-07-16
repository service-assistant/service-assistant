const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpError extends Error {
	status: number;

	constructor(status: number, message = `HTTP request failed: ${status}`) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
	}
}

export const isTransientNetworkError = (error: unknown) => {
	if (error instanceof HttpError) return TRANSIENT_HTTP_STATUSES.has(error.status);
	if (error instanceof TypeError) return true;

	const message = error instanceof Error ? error.message : String(error);
	if (/\b(?:408|425|429|500|502|503|504)\b/.test(message)) return true;

	return /network|fetch failed|load failed|timed?\s*out|connection|socket|sse stream/i.test(
		message,
	);
};

const wait = (milliseconds: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const createAbortError = () => {
			const error = new Error('The operation was aborted.');
			error.name = 'AbortError';
			return error;
		};

		if (signal?.aborted) {
			reject(createAbortError());
			return;
		}

		const timeout = setTimeout(() => {
			signal?.removeEventListener('abort', handleAbort);
			resolve();
		}, milliseconds);
		const handleAbort = () => {
			clearTimeout(timeout);
			reject(createAbortError());
		};
		signal?.addEventListener('abort', handleAbort, { once: true });
	});

type FetchWithRetryOptions = {
	retryDelaysMs?: number[];
};

const DEFAULT_RETRY_DELAYS_MS = process.env.NODE_ENV === 'test' ? [] : [500, 1500, 3000];

export const fetchWithRetry = async (
	input: RequestInfo | URL,
	init: RequestInit = {},
	options: FetchWithRetryOptions = {},
) => {
	const method = (init.method || 'GET').toUpperCase();
	const retryDelays =
		method === 'GET' || method === 'HEAD'
			? (options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS)
			: [];
	let lastError: unknown;

	for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
		try {
			const response = await fetch(input, init);
			if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt === retryDelays.length) {
				return response;
			}
		} catch (error) {
			lastError = error;
			if (!isTransientNetworkError(error) || attempt === retryDelays.length) throw error;
		}

		const jitter = process.env.NODE_ENV === 'test' ? 0 : Math.floor(Math.random() * 200);
		await wait(retryDelays[attempt] + jitter, init.signal ?? undefined);
	}

	throw lastError;
};
