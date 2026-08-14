const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

const loadApiConfig = async () => {
	jest.resetModules();
	return import('../utils/api-config');
};

afterEach(() => {
	if (originalApiUrl === undefined) {
		delete process.env.EXPO_PUBLIC_API_URL;
	} else {
		process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
	}
	jest.resetModules();
});

describe('api config', () => {
	test('raises a config error when API_URL is missing', async () => {
		delete process.env.EXPO_PUBLIC_API_URL;

		const config = await loadApiConfig();

		expect(config.API_URL).toBe('');
		expect(config.API_URL_CONFIG_ERROR?.message).toBe('Missing API_URL');
		expect(
			(config.API_URL_CONFIG_ERROR as Error & { serviceFeature?: string })?.serviceFeature,
		).toBe(config.CONFIG_SERVICE_FEATURE);
	});

	test('trims whitespace and trailing slashes from configured URL', async () => {
		process.env.EXPO_PUBLIC_API_URL = ' https://api.example.test/// ';

		const config = await loadApiConfig();

		expect(config.API_URL).toBe('https://api.example.test');
		expect(config.API_URL_CONFIG_ERROR).toBeNull();
	});

	test('flags unsupported URL protocols', async () => {
		process.env.EXPO_PUBLIC_API_URL = 'ftp://api.example.test';

		const config = await loadApiConfig();

		expect(config.API_URL).toBe('ftp://api.example.test');
		expect(config.API_URL_CONFIG_ERROR?.message).toBe(
			'Invalid API_URL: ftp://api.example.test',
		);
		expect(
			(config.API_URL_CONFIG_ERROR as Error & { serviceFeature?: string })?.serviceFeature,
		).toBe(config.CONFIG_SERVICE_FEATURE);
	});

	test('flags a URL that cannot be parsed', async () => {
		process.env.EXPO_PUBLIC_API_URL = 'not a url';

		const config = await loadApiConfig();

		expect(config.API_URL_CONFIG_ERROR?.message).toBe('Invalid API_URL: not a url');
	});
});
