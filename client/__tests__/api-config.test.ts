const originalAuthUrl = process.env.AUTH_URL;

const loadApiConfig = async () => {
	jest.resetModules();
	return import('../utils/api-config');
};

afterEach(() => {
	if (originalAuthUrl === undefined) {
		delete process.env.AUTH_URL;
	} else {
		process.env.AUTH_URL = originalAuthUrl;
	}
	jest.resetModules();
});

describe('api config', () => {
	test('uses the staging URL by default', async () => {
		delete process.env.AUTH_URL;

		const config = await loadApiConfig();

		expect(config.AUTH_URL).toBe('https://staging.asystent-serwisanta.pl');
		expect(config.AUTH_URL_CONFIG_ERROR).toBeNull();
	});

	test('trims whitespace and trailing slashes from configured URL', async () => {
		process.env.AUTH_URL = ' https://api.example.test/// ';

		const config = await loadApiConfig();

		expect(config.AUTH_URL).toBe('https://api.example.test');
		expect(config.AUTH_URL_CONFIG_ERROR).toBeNull();
	});

	test('flags unsupported URL protocols', async () => {
		process.env.AUTH_URL = 'ftp://api.example.test';

		const config = await loadApiConfig();

		expect(config.AUTH_URL).toBe('ftp://api.example.test');
		expect(config.AUTH_URL_CONFIG_ERROR?.message).toBe(
			'Invalid AUTH_URL: ftp://api.example.test',
		);
		expect(
			(config.AUTH_URL_CONFIG_ERROR as Error & { serviceFeature?: string })?.serviceFeature,
		).toBe(config.CONFIG_SERVICE_FEATURE);
	});

	test('falls back to default URL when configured URL cannot be parsed', async () => {
		process.env.AUTH_URL = 'not a url';

		const config = await loadApiConfig();

		expect(config.AUTH_URL).toBe('https://staging.asystent-serwisanta.pl');
		expect(config.AUTH_URL_CONFIG_ERROR?.message).toBe(
			'Invalid AUTH_URL: not a url',
		);
	});
});
