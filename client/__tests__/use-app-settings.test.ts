const STORAGE_KEY = 'service-assistant:app-settings';
const STORAGE_FILE_URI = 'file:///documents/service-assistant-app-settings.json';
let mockPlatformOS = 'web';
const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();

jest.mock('react-native', () => ({
	Platform: {
		get OS() {
			return mockPlatformOS;
		},
	},
}));

jest.mock('expo-file-system/legacy', () => ({
	documentDirectory: 'file:///documents/',
	getInfoAsync: mockGetInfoAsync,
	readAsStringAsync: mockReadAsStringAsync,
	writeAsStringAsync: mockWriteAsStringAsync,
}));

const createMockLocalStorage = (initialValues: Record<string, string> = {}) => {
	const store = new Map(Object.entries(initialValues));

	return {
		getItem: jest.fn((key: string) => store.get(key) ?? null),
		setItem: jest.fn((key: string, value: string) => {
			store.set(key, value);
		}),
		removeItem: jest.fn((key: string) => {
			store.delete(key);
		}),
		clear: jest.fn(() => {
			store.clear();
		}),
		key: jest.fn((index: number) => Array.from(store.keys())[index] ?? null),
		get length() {
			return store.size;
		},
	} as Storage;
};

const setMockLocalStorage = (storage: Storage | undefined) => {
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: storage,
	});
};

describe('use-app-settings store', () => {
	beforeEach(() => {
		mockPlatformOS = 'web';
		mockGetInfoAsync.mockReset();
		mockReadAsStringAsync.mockReset();
		mockWriteAsStringAsync.mockReset();
		mockGetInfoAsync.mockResolvedValue({ exists: false });
		mockReadAsStringAsync.mockResolvedValue('');
		mockWriteAsStringAsync.mockResolvedValue(undefined);
	});

	afterEach(() => {
		jest.resetModules();
		setMockLocalStorage(undefined);
	});

	test('loads saved settings from localStorage', () => {
		setMockLocalStorage(
			createMockLocalStorage({
				[STORAGE_KEY]: JSON.stringify({
					wakeWordEnabled: true,
					ttsEnabled: true,
				}),
			}),
		);

		jest.isolateModules(() => {
			const { getAppSettings } = require('../hooks/use-app-settings');

			expect(getAppSettings()).toMatchObject({
				wakeWordEnabled: true,
				ttsEnabled: true,
			});
		});
	});

	test('saves settings to localStorage when they change', () => {
		const localStorage = createMockLocalStorage();
		setMockLocalStorage(localStorage);

		jest.isolateModules(() => {
			const { setAppSetting } = require('../hooks/use-app-settings');

			setAppSetting('wakeWordEnabled', true);
			setAppSetting('ttsEnabled', true);

			expect(localStorage.setItem).toHaveBeenLastCalledWith(
				STORAGE_KEY,
				JSON.stringify({
					wakeWordEnabled: true,
					ttsEnabled: true,
				}),
			);
		});
	});

	test('loads saved settings from the native file store', async () => {
		mockPlatformOS = 'android';
		mockGetInfoAsync.mockResolvedValue({ exists: true });
		mockReadAsStringAsync.mockResolvedValue(
			JSON.stringify({
				wakeWordEnabled: true,
				ttsEnabled: true,
			}),
		);

		await jest.isolateModulesAsync(async () => {
			const { getAppSettings, loadAppSettings } = require('../hooks/use-app-settings');

			expect(getAppSettings()).toMatchObject({
				wakeWordEnabled: false,
				ttsEnabled: false,
			});

			await loadAppSettings();

			expect(mockGetInfoAsync).toHaveBeenCalledWith(STORAGE_FILE_URI);
			expect(mockReadAsStringAsync).toHaveBeenCalledWith(STORAGE_FILE_URI);
			expect(getAppSettings()).toMatchObject({
				wakeWordEnabled: true,
				ttsEnabled: true,
			});
		});
	});

	test('saves settings to the native file store', async () => {
		mockPlatformOS = 'android';

		await jest.isolateModulesAsync(async () => {
			const { setAppSetting } = require('../hooks/use-app-settings');

			setAppSetting('wakeWordEnabled', true);
			setAppSetting('ttsEnabled', true);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(mockWriteAsStringAsync).toHaveBeenLastCalledWith(
				STORAGE_FILE_URI,
				JSON.stringify({
					wakeWordEnabled: true,
					ttsEnabled: true,
				}),
			);
		});
	});
});
