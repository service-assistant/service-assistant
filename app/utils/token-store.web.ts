const SESSION_TOKEN_KEY = 'session_token';

// The native implementation uses expo-secure-store. Expo SecureStore is not
// available in a browser, so web keeps the session in localStorage instead.
// The in-memory copy preserves the synchronous API used by request helpers.
let cachedToken: string | null = null;

export const getCachedToken = (): string | null => cachedToken;

export const loadStoredToken = async (): Promise<string | null> => {
	if (typeof window === 'undefined') {
		cachedToken = null;
		return cachedToken;
	}

	try {
		cachedToken = window.localStorage.getItem(SESSION_TOKEN_KEY);
	} catch {
		cachedToken = null;
	}
	return cachedToken;
};

export const setStoredToken = async (token: string): Promise<void> => {
	cachedToken = token;
	if (typeof window === 'undefined') return;

	try {
		window.localStorage.setItem(SESSION_TOKEN_KEY, token);
	} catch {
		// Keep the current browser session usable when persistent storage is
		// unavailable (for example because of restrictive privacy settings).
	}
};

export const clearStoredToken = async (): Promise<void> => {
	cachedToken = null;
	if (typeof window === 'undefined') return;

	try {
		window.localStorage.removeItem(SESSION_TOKEN_KEY);
	} catch {
		// The in-memory token has already been cleared.
	}
};

export const __setCachedTokenForTests = (token: string | null): void => {
	cachedToken = token;
};
