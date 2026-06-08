export const AUTH_SERVICE_FEATURE = 'autoryzacja aplikacji';

type ServiceFeatureError = Error & {
	serviceFeature?: string;
};

export const createMissingAuthTokenError = () =>
	Object.assign(new Error('Missing EXPO_PUBLIC_AUTH_TOKEN'), {
		serviceFeature: AUTH_SERVICE_FEATURE,
	});

export const createInvalidAuthTokenError = (status: number) =>
	Object.assign(new Error(`Invalid EXPO_PUBLIC_AUTH_TOKEN: ${status}`), {
		serviceFeature: AUTH_SERVICE_FEATURE,
	});

export const getAuthTokenOrThrow = () => {
	const authToken = process.env.EXPO_PUBLIC_AUTH_TOKEN || '';
	if (!authToken) throw createMissingAuthTokenError();
	return authToken;
};

export const throwIfAuthResponseError = (response: Response) => {
	if (response.status === 401 || response.status === 403) {
		throw createInvalidAuthTokenError(response.status);
	}
};

export const getServiceErrorFeature = (error: unknown, fallbackFeature: string) => {
	if (
		error &&
		typeof error === 'object' &&
		'serviceFeature' in error &&
		typeof (error as ServiceFeatureError).serviceFeature === 'string'
	) {
		return (error as ServiceFeatureError).serviceFeature!;
	}

	return fallbackFeature;
};
