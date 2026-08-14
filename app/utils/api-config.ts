export const CONFIG_SERVICE_FEATURE = 'konfiguracja aplikacji';

const createApiUrlConfigError = (message: string) =>
	Object.assign(new Error(message), {
		serviceFeature: CONFIG_SERVICE_FEATURE,
	});

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

let normalizedApiUrl = '';
let apiUrlConfigError: Error | null = null;

if (!rawApiUrl) {
	apiUrlConfigError = createApiUrlConfigError('Missing API_URL');
} else {
	normalizedApiUrl = rawApiUrl.replace(/\/+$/, '');

	try {
		const parsedUrl = new URL(normalizedApiUrl);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			apiUrlConfigError = createApiUrlConfigError(`Invalid API_URL: ${rawApiUrl}`);
		}
	} catch {
		apiUrlConfigError = createApiUrlConfigError(`Invalid API_URL: ${rawApiUrl}`);
	}
}

export const API_URL = normalizedApiUrl;
export const API_URL_CONFIG_ERROR = apiUrlConfigError;
