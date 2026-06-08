const DEFAULT_AUTH_URL = 'https://staging.asystent-serwisanta.pl';

export const CONFIG_SERVICE_FEATURE = 'konfiguracja aplikacji';

const createAuthUrlConfigError = (value: string) =>
	Object.assign(new Error(`Invalid EXPO_PUBLIC_AUTH_URL: ${value}`), {
		serviceFeature: CONFIG_SERVICE_FEATURE,
	});

const rawAuthUrl = process.env.EXPO_PUBLIC_AUTH_URL?.trim() || DEFAULT_AUTH_URL;

let normalizedAuthUrl = rawAuthUrl.replace(/\/+$/, '');
let authUrlConfigError: Error | null = null;

try {
	const parsedUrl = new URL(normalizedAuthUrl);
	if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
		authUrlConfigError = createAuthUrlConfigError(rawAuthUrl);
	}
} catch {
	authUrlConfigError = createAuthUrlConfigError(rawAuthUrl);
	normalizedAuthUrl = DEFAULT_AUTH_URL;
}

export const AUTH_URL = normalizedAuthUrl;
export const AUTH_URL_CONFIG_ERROR = authUrlConfigError;
