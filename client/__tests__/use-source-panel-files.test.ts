import type { AvailableFile } from '@/types/chat';

let mockReactStateValues: unknown[] = [];
let mockReactStateIndex = 0;
const mockPlatform = { OS: 'ios' };
const mockAlertAlert = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockDownloadAsync = jest.fn();
const mockCancelAsync = jest.fn();
const mockCreateDownloadResumable = jest.fn();

jest.mock('react', () => ({
	useCallback: (callback: unknown) => callback,
	useEffect: (callback: () => void | (() => void)) => {
		callback();
	},
	useRef: (initialValue: unknown) => ({ current: initialValue }),
	useState: (initialValue: unknown) => {
		const stateIndex = mockReactStateIndex;
		mockReactStateIndex += 1;

		if (mockReactStateValues.length <= stateIndex) {
			mockReactStateValues[stateIndex] =
				typeof initialValue === 'function' ? initialValue() : initialValue;
		}

		const setState = (value: unknown) => {
			mockReactStateValues[stateIndex] =
				typeof value === 'function' ? value(mockReactStateValues[stateIndex]) : value;
		};

		return [mockReactStateValues[stateIndex], setState];
	},
}));

jest.mock('react-native', () => ({
	Alert: { alert: mockAlertAlert },
	Platform: mockPlatform,
}));

jest.mock('expo-file-system/legacy', () => ({
	documentDirectory: 'file:///documents/',
	getInfoAsync: mockGetInfoAsync,
	deleteAsync: mockDeleteAsync,
	createDownloadResumable: mockCreateDownloadResumable,
}));

import { Alert, Platform } from 'react-native';
import { useSourcePanelFiles } from '../hooks/use-source-panel-files';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const testFile: AvailableFile = {
	id: 11,
	name: 'Manual: hydraulic/pump?.pdf',
	icon: 'file-pdf-box',
	color: '#EF4444',
	remoteUrl: 'https://api.example.test/files/manual.pdf',
};

const createHarness = (
	params: {
		availableFiles?: AvailableFile[];
		authTokenOverride?: string | null;
		initialState?: unknown[];
	} = {},
) => {
	mockReactStateValues = params.initialState ?? [];
	mockReactStateIndex = 0;

	const onServiceError = jest.fn();
	const api = useSourcePanelFiles({
		availableFiles: params.availableFiles ?? [],
		isAvailableFilesLoading: false,
		serverUrl: 'https://api.example.test',
		onServiceError,
		authTokenOverride: 'authTokenOverride' in params ? params.authTokenOverride : 'test-token',
	});

	return {
		api,
		onServiceError,
		get state() {
			return {
				showSourcePanel: mockReactStateValues[0],
				sourcePanelPdf: mockReactStateValues[1],
				isFileDownloading: mockReactStateValues[2],
				downloadingFileId: mockReactStateValues[3],
				downloadedFileIds: mockReactStateValues[4] as Set<number>,
			};
		},
	};
};

describe('useSourcePanelFiles', () => {
	beforeEach(() => {
		Platform.OS = 'ios';
		mockAlertAlert.mockReset();
		mockGetInfoAsync.mockReset();
		mockDeleteAsync.mockReset();
		mockDownloadAsync.mockReset();
		mockCancelAsync.mockReset();
		mockCreateDownloadResumable.mockReset();
		mockGetInfoAsync.mockResolvedValue({ exists: false });
		mockDownloadAsync.mockResolvedValue({ uri: 'file:///documents/manual.pdf' });
		mockCreateDownloadResumable.mockReturnValue({
			downloadAsync: mockDownloadAsync,
			cancelAsync: mockCancelAsync,
		});
		jest.spyOn(console, 'log').mockImplementation(() => {});
		global.fetch = jest.fn();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		delete process.env.EXPO_PUBLIC_AUTH_TOKEN;
	});

	test('opens a message source with an authorized remote PDF source', () => {
		const harness = createHarness();

		harness.api.openMessageSource({
			sourceAttachmentId: 77,
			sourceAttachmentName: 'manual.pdf',
			sourceAttachmentPage: 4,
		});

		expect(harness.state.showSourcePanel).toBe(true);
		expect(harness.state.sourcePanelPdf).toEqual({
			name: 'manual.pdf',
			icon: 'file-pdf-box',
			color: '#EF4444',
			source: {
				uri: 'https://api.example.test/api/attachments/77/file',
				headers: {
					Authorization: 'Bearer test-token',
				},
			},
			page: 5,
		});
	});

	test('reports auth configuration errors when opening a message source without a token', () => {
		const harness = createHarness({ authTokenOverride: null });

		harness.api.openMessageSource({ sourceAttachmentId: 77 });

		expect(harness.onServiceError).toHaveBeenCalledWith(
			'autoryzacja aplikacji',
			expect.objectContaining({
				message: 'Missing EXPO_PUBLIC_AUTH_TOKEN',
				serviceFeature: 'autoryzacja aplikacji',
			}),
		);
		expect(harness.state.showSourcePanel).toBe(false);
	});

	test('downloads files on native platforms with auth headers and sanitized local names', async () => {
		const harness = createHarness();

		await harness.api.openFileInSourcePanel(testFile);

		expect(mockCreateDownloadResumable).toHaveBeenCalledWith(
			testFile.remoteUrl,
			'file:///documents/attachment-11-Manual_ hydraulic_pump_.pdf',
			{ headers: { Authorization: 'Bearer test-token' } },
		);
		expect(harness.state.sourcePanelPdf).toEqual({
			name: testFile.name,
			icon: 'file-download',
			color: '#22C55E',
			source: { uri: 'file:///documents/manual.pdf' },
			page: 1,
		});
		expect(harness.state.downloadedFileIds.has(11)).toBe(true);
		expect(harness.state.showSourcePanel).toBe(true);
		expect(harness.state.isFileDownloading).toBe(false);
		expect(harness.state.downloadingFileId).toBeNull();
	});

	test('downloads files on web through fetch and object URLs', async () => {
		Platform.OS = 'web';
		const objectUrl = 'blob:manual-pdf';
		const createObjectURL = jest.fn(() => objectUrl);
		const revokeObjectURL = jest.fn();
		Object.defineProperty(global.URL, 'createObjectURL', {
			value: createObjectURL,
			configurable: true,
		});
		Object.defineProperty(global.URL, 'revokeObjectURL', {
			value: revokeObjectURL,
			configurable: true,
		});
		jest.mocked(global.fetch).mockResolvedValue(
			new Response('pdf', {
				status: 200,
				headers: { 'content-type': 'application/pdf' },
			}),
		);
		const harness = createHarness();

		await harness.api.openFileInSourcePanel(testFile);

		expect(global.fetch).toHaveBeenCalledWith(testFile.remoteUrl, {
			headers: { Authorization: 'Bearer test-token' },
		});
		expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
		expect(harness.state.sourcePanelPdf).toEqual({
			name: testFile.name,
			icon: 'file-download',
			color: '#22C55E',
			source: objectUrl,
			page: 1,
		});
		expect(mockCreateDownloadResumable).not.toHaveBeenCalled();
	});

	test('deletes downloaded native files and updates the downloaded id set', async () => {
		mockGetInfoAsync.mockResolvedValue({ exists: true });
		const harness = createHarness();
		harness.state.downloadedFileIds.add(11);

		await harness.api.sourcePanelProps.onDeleteDownloadedFile(testFile);

		expect(mockDeleteAsync).toHaveBeenCalledWith(
			'file:///documents/attachment-11-Manual_ hydraulic_pump_.pdf',
			{ idempotent: true },
		);
		expect(harness.state.downloadedFileIds.has(11)).toBe(false);
	});

	test('shows an alert for non-auth download failures', async () => {
		mockDownloadAsync.mockResolvedValue({ status: 500 });
		const harness = createHarness();

		await harness.api.openFileInSourcePanel(testFile);

		expect(harness.onServiceError).toHaveBeenCalledWith(
			'pobieranie pliku',
			expect.objectContaining({ message: 'Download failed - no URI' }),
		);
		expect(Alert.alert).toHaveBeenCalledWith(
			'Błąd',
			`Nie udało się pobrać pliku: ${testFile.name}`,
		);
		expect(harness.state.isFileDownloading).toBe(false);
	});

	test('maps authorized PDF render errors to auth service errors', () => {
		const harness = createHarness();
		harness.api.openMessageSource({ sourceAttachmentId: 77 });

		const rerenderedHarness = createHarness({
			initialState: [true, harness.state.sourcePanelPdf, false, null, new Set()],
		});
		rerenderedHarness.api.sourcePanelProps.onPdfError?.(new Error('render failed'));

		expect(rerenderedHarness.onServiceError).toHaveBeenCalledWith(
			'autoryzacja aplikacji',
			expect.objectContaining({
				message: 'Invalid EXPO_PUBLIC_AUTH_TOKEN: 401',
				serviceFeature: 'autoryzacja aplikacji',
			}),
		);
	});

	test('marks already downloaded files from local file checks', async () => {
		mockGetInfoAsync.mockResolvedValue({ exists: true });
		const harness = createHarness({ availableFiles: [testFile] });

		await flushPromises();

		expect(mockGetInfoAsync).toHaveBeenCalledWith(
			'file:///documents/attachment-11-Manual_ hydraulic_pump_.pdf',
		);
		expect(harness.state.downloadedFileIds.has(11)).toBe(true);
	});
});
