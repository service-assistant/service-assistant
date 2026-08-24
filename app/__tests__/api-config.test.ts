const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
const originalWebApiUrl = process.env.EXPO_PUBLIC_API_URL_WEB;
const originalExpoOs = process.env.EXPO_OS;

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
	if (originalWebApiUrl === undefined) {
		delete process.env.EXPO_PUBLIC_API_URL_WEB;
	} else {
		process.env.EXPO_PUBLIC_API_URL_WEB = originalWebApiUrl;
	}
	if (originalExpoOs === undefined) {
		delete process.env.EXPO_OS;
	} else {
		process.env.EXPO_OS = originalExpoOs;
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

	test('uses the web-specific URL in the browser', async () => {
		process.env.EXPO_OS = 'web';
		process.env.EXPO_PUBLIC_API_URL = 'http://192.168.0.240:8000';
		process.env.EXPO_PUBLIC_API_URL_WEB = 'http://127.0.0.1:8000';

		const config = await loadApiConfig();

		expect(config.API_URL).toBe('http://127.0.0.1:8000');
		expect(config.API_URL_CONFIG_ERROR).toBeNull();
	});

	test('uses the default URL on mobile', async () => {
		process.env.EXPO_OS = 'ios';
		process.env.EXPO_PUBLIC_API_URL = 'http://192.168.0.240:8000';
		process.env.EXPO_PUBLIC_API_URL_WEB = 'http://127.0.0.1:8000';

		const config = await loadApiConfig();

		expect(config.API_URL).toBe('http://192.168.0.240:8000');
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
