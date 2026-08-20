import {
	AUTH_SERVICE_FEATURE,
	createInvalidAuthTokenError,
	createMissingAuthTokenError,
	getAuthTokenOrThrow,
	getServiceErrorFeature,
	throwIfAuthResponseError,
} from '../utils/auth-errors';
import { __setCachedTokenForTests } from '../utils/token-store';

afterEach(() => {
	__setCachedTokenForTests(null);
});

describe('auth error helpers', () => {
	test('creates service-tagged missing token errors', () => {
		const error = createMissingAuthTokenError();

		expect(error.message).toBe('Missing AUTH_TOKEN');
		expect(error.serviceFeature).toBe(AUTH_SERVICE_FEATURE);
	});

	test('creates service-tagged invalid token errors', () => {
		const error = createInvalidAuthTokenError(403);

		expect(error.message).toBe('Invalid AUTH_TOKEN: 403');
		expect(error.serviceFeature).toBe(AUTH_SERVICE_FEATURE);
	});

	test('reads the cached session token', () => {
		__setCachedTokenForTests('token-123');

		expect(getAuthTokenOrThrow()).toBe('token-123');
	});

	test('throws service-tagged error when no session token is cached', () => {
		__setCachedTokenForTests(null);

		expect(() => getAuthTokenOrThrow()).toThrow('Missing AUTH_TOKEN');
		try {
			getAuthTokenOrThrow();
		} catch (error) {
			expect(getServiceErrorFeature(error, 'fallback')).toBe(AUTH_SERVICE_FEATURE);
		}
	});

	test('throws invalid token errors only for auth response statuses', () => {
		expect(() => throwIfAuthResponseError(new Response(null, { status: 401 }))).toThrow(
			'Invalid AUTH_TOKEN: 401',
		);
		expect(() => throwIfAuthResponseError(new Response(null, { status: 403 }))).toThrow(
			'Invalid AUTH_TOKEN: 403',
		);
		expect(() => throwIfAuthResponseError(new Response(null, { status: 500 }))).not.toThrow();
	});

	test('falls back when an error is not service-tagged', () => {
		expect(getServiceErrorFeature(new Error('boom'), 'fallback')).toBe('fallback');
	});
});
