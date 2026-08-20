import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'session_token';

// In-memory cache so `getCachedToken()` (used by `getAuthTokenOrThrow` and
// every hook that builds an Authorization header) can stay synchronous —
// SecureStore itself is async, so the cache is populated once at app boot
// via `loadStoredToken()` and kept in sync on login/logout.
let cachedToken: string | null = null;

export const getCachedToken = (): string | null => cachedToken;

export const loadStoredToken = async (): Promise<string | null> => {
	cachedToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
	return cachedToken;
};

export const setStoredToken = async (token: string): Promise<void> => {
	cachedToken = token;
	await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
};

export const clearStoredToken = async (): Promise<void> => {
	cachedToken = null;
	await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
};

/** Test-only synchronous setter — mirrors how tests used to stub
 * `process.env.EXPO_PUBLIC_AUTH_TOKEN` before auth became session-based. */
export const __setCachedTokenForTests = (token: string | null): void => {
	cachedToken = token;
};
