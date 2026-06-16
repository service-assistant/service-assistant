import {
	AUTH_SERVICE_FEATURE,
	createInvalidAuthTokenError,
	createMissingAuthTokenError,
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '../utils/auth-errors';

const originalAuthToken = process.env.EXPO_PUBLIC_AUTH_TOKEN;

afterEach(() => {
	if (originalAuthToken === undefined) {
		delete process.env.EXPO_PUBLIC_AUTH_TOKEN;
	} else {
		process.env.EXPO_PUBLIC_AUTH_TOKEN = originalAuthToken;
	}
});

describe('auth error helpers', () => {
	test('creates service-tagged missing token errors', () => {
		const error = createMissingAuthTokenError();

		expect(error.message).toBe('Missing EXPO_PUBLIC_AUTH_TOKEN');
		expect(error.serviceFeature).toBe(AUTH_SERVICE_FEATURE);
	});

	test('creates service-tagged invalid token errors', () => {
		const error = createInvalidAuthTokenError(403);

		expect(error.message).toBe('Invalid EXPO_PUBLIC_AUTH_TOKEN: 403');
		expect(error.serviceFeature).toBe(AUTH_SERVICE_FEATURE);
	});

	test('reads configured auth token', () => {
		process.env.EXPO_PUBLIC_AUTH_TOKEN = 'token-123';

		expect(getAuthTokenOrThrow()).toBe('token-123');
	});

	test('throws service-tagged error when auth token is missing', () => {
		delete process.env.EXPO_PUBLIC_AUTH_TOKEN;

		expect(() => getAuthTokenOrThrow()).toThrow('Missing EXPO_PUBLIC_AUTH_TOKEN');
		try {
			getAuthTokenOrThrow();
		} catch (error) {
			expect(getServiceErrorFeature(error, 'fallback')).toBe(AUTH_SERVICE_FEATURE);
		}
	});

	test('throws invalid token errors only for auth response statuses', () => {
		expect(() => throwIfAuthResponseError(new Response(null, { status: 401 }))).toThrow(
			'Invalid EXPO_PUBLIC_AUTH_TOKEN: 401',
		);
		expect(() => throwIfAuthResponseError(new Response(null, { status: 403 }))).toThrow(
			'Invalid EXPO_PUBLIC_AUTH_TOKEN: 403',
		);
		expect(() => throwIfAuthResponseError(new Response(null, { status: 500 }))).not.toThrow();
	});

	test('falls back when an error is not service-tagged', () => {
		expect(getServiceErrorFeature(new Error('boom'), 'fallback')).toBe('fallback');
	});
});
