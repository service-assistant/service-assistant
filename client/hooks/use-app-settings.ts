import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type AppSettings = {
	wakeWordEnabled: boolean;
	ttsEnabled: boolean;
};

const STORAGE_KEY = 'service-assistant:app-settings';
const STORAGE_FILE_URI = FileSystem.documentDirectory
	? `${FileSystem.documentDirectory}service-assistant-app-settings.json`
	: null;

const DEFAULT_APP_SETTINGS: AppSettings = {
	wakeWordEnabled: false,
	ttsEnabled: false,
};

const parseStoredAppSettings = (storedValue: string | null): Partial<AppSettings> => {
	if (!storedValue) return {};

	const parsedValue = JSON.parse(storedValue) as Partial<AppSettings>;

	return {
		...(typeof parsedValue.wakeWordEnabled === 'boolean'
			? { wakeWordEnabled: parsedValue.wakeWordEnabled }
			: {}),
		...(typeof parsedValue.ttsEnabled === 'boolean'
			? { ttsEnabled: parsedValue.ttsEnabled }
			: {}),
	};
};

const readLocalStorageAppSettings = (): Partial<AppSettings> => {
	try {
		const storedValue = globalThis.localStorage?.getItem(STORAGE_KEY);
		return parseStoredAppSettings(storedValue);
	} catch (error) {
		console.log('Handled app settings read error:', error);
		return {};
	}
};

const readFileAppSettings = async (): Promise<Partial<AppSettings>> => {
	if (!STORAGE_FILE_URI) return {};

	try {
		const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE_URI);
		if (!fileInfo.exists) return {};

		const storedValue = await FileSystem.readAsStringAsync(STORAGE_FILE_URI);
		return parseStoredAppSettings(storedValue);
	} catch (error) {
		console.log('Handled app settings file read error:', error);
		return {};
	}
};

const saveAppSettings = async () => {
	try {
		if (Platform.OS !== 'web' && STORAGE_FILE_URI) {
			await FileSystem.writeAsStringAsync(STORAGE_FILE_URI, JSON.stringify(appSettings));
			return;
		}

		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(appSettings));
	} catch (error) {
		console.log('Handled app settings write error:', error);
	}
};

const appSettings: AppSettings = {
	...DEFAULT_APP_SETTINGS,
	...(Platform.OS === 'web' ? readLocalStorageAppSettings() : {}),
};
let hasLoadedStoredAppSettings = Platform.OS === 'web';
let appSettingsLoadPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

const notifyListeners = () => {
	listeners.forEach((listener) => listener());
};

const subscribeToAppSettings = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export const getAppSettings = () => appSettings;

export const loadAppSettings = async () => {
	if (hasLoadedStoredAppSettings) return;
	if (appSettingsLoadPromise) return appSettingsLoadPromise;

	appSettingsLoadPromise = readFileAppSettings()
		.then((storedSettings) => {
			Object.assign(appSettings, storedSettings);
			hasLoadedStoredAppSettings = true;
			notifyListeners();
		})
		.finally(() => {
			appSettingsLoadPromise = null;
		});

	return appSettingsLoadPromise;
};

export const setAppSetting = <TKey extends keyof AppSettings>(
	key: TKey,
	value: AppSettings[TKey],
) => {
	if (appSettings[key] === value) return;

	appSettings[key] = value;
	void saveAppSettings();
	notifyListeners();
};

export const useAppSettings = () => {
	const [settings, setSettings] = useState<AppSettings>(() => ({ ...appSettings }));

	useEffect(() => {
		void loadAppSettings();

		return subscribeToAppSettings(() => {
			setSettings({ ...appSettings });
		});
	}, []);

	return {
		...settings,
		setWakeWordEnabled: (value: boolean) => setAppSetting('wakeWordEnabled', value),
		setTtsEnabled: (value: boolean) => setAppSetting('ttsEnabled', value),
	};
};
