type Listener = (event: Record<string, unknown>) => void;

class MockEventSource {
	static instances: MockEventSource[] = [];

	listeners: Record<string, Listener> = {};
	close = jest.fn();

	constructor(
		public url: string,
		public options: Record<string, unknown>,
	) {
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: Listener) {
		this.listeners[type] = listener;
	}

	emit(type: string, event: Record<string, unknown>) {
		this.listeners[type]?.(event);
	}
}

jest.mock('react-native-sse', () => ({
	__esModule: true,
	default: MockEventSource,
}));

jest.mock('react', () => ({
	useCallback: (callback: unknown) => callback,
	useEffect: (callback: () => void | (() => void)) => {
		callback();
	},
	useRef: (initialValue: unknown) => ({ current: initialValue }),
}));

jest.mock('@/components/ChatMessages', () => ({
	stripResponseDirectivesForSpeech: (text: string) =>
		text
			.replace(/::(checklist|warning|next)\b[ \t]*/gi, '')
			.replace(/^\s*[-*]\s+/gm, '')
			.trim(),
}));

import type { ChatMessageItem } from '@/components/ChatMessages';
import { useChatApi } from '../hooks/use-chat-api';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const createJsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

const createImageResponse = (body = 'image-data', status = 200) =>
	new Response(body, {
		status,
		headers: { 'content-type': 'image/png' },
	});

const createHarness = (params: { currentThreadId?: number | null } = {}) => {
	let currentThreadId = params.currentThreadId ?? null;
	let messages: ChatMessageItem[] = [];
	let isLoading = false;
	let isGenerating = false;
	let currentImage: string | null = null;

	const setCurrentThreadId = jest.fn(
		(value: number | null | ((prev: number | null) => number | null)) => {
			currentThreadId = typeof value === 'function' ? value(currentThreadId) : value;
		},
	);
	const setMessages = jest.fn(
		(value: ChatMessageItem[] | ((prev: ChatMessageItem[]) => ChatMessageItem[])) => {
			messages = typeof value === 'function' ? value(messages) : value;
		},
	);
	const setIsLoading = jest.fn((value: boolean | ((prev: boolean) => boolean)) => {
		isLoading = typeof value === 'function' ? value(isLoading) : value;
	});
	const setIsGenerating = jest.fn((value: boolean | ((prev: boolean) => boolean)) => {
		isGenerating = typeof value === 'function' ? value(isGenerating) : value;
	});
	const setCurrentImage = jest.fn(
		(value: string | null | ((prev: string | null) => string | null)) => {
			currentImage = typeof value === 'function' ? value(currentImage) : value;
		},
	);
	const playAssistantAudio = jest.fn();
	const onServiceError = jest.fn();

	const api = useChatApi({
		serverUrl: 'https://api.example.test',
		deviceId: 42,
		currentThreadId,
		setCurrentThreadId,
		setMessages,
		setIsLoading,
		setIsGenerating,
		setCurrentImage,
		playAssistantAudio,
		onServiceError,
		authTokenOverride: 'test-token',
	});

	return {
		api,
		get state() {
			return { currentThreadId, messages, isLoading, isGenerating, currentImage };
		},
		setCurrentThreadId,
		setMessages,
		setIsLoading,
		setIsGenerating,
		setCurrentImage,
		playAssistantAudio,
		onServiceError,
	};
};

describe('useChatApi', () => {
	beforeEach(() => {
		MockEventSource.instances = [];
		jest.spyOn(Date, 'now').mockReturnValue(1000);
		jest.spyOn(Math, 'random').mockReturnValue(0.5);
		global.fetch = jest.fn();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('creates a thread, streams chunks, and finalizes the assistant message', async () => {
		const fetchMock = jest.mocked(global.fetch);
		fetchMock
			.mockResolvedValueOnce(createJsonResponse({ id: 123 }))
			.mockResolvedValueOnce(createJsonResponse([]));
		const harness = createHarness();

		const request = harness.api.askAPI('How do I start this device?');
		await flushPromises();

		expect(fetchMock).toHaveBeenNthCalledWith(
			1,
			'https://api.example.test/api/threads',
			expect.objectContaining({
				method: 'POST',
				headers: {
					Authorization: 'Bearer test-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					device_id: 42,
					title: 'How do I start this device?',
				}),
			}),
		);
		expect(harness.setCurrentThreadId).toHaveBeenCalledWith(123);
		expect(MockEventSource.instances).toHaveLength(1);
		expect(MockEventSource.instances[0].url).toBe(
			'https://api.example.test/api/threads/123/messages',
		);
		expect(MockEventSource.instances[0].options).toMatchObject({
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'text/event-stream',
				Authorization: 'Bearer test-token',
			},
			body: JSON.stringify({ content: 'How do I start this device?' }),
		});

		MockEventSource.instances[0].emit('chunk', {
			data: 'Steps: 1. Turn key 2. Press start',
		});

		expect(harness.state.messages).toEqual([
			{
				id: 1000.5,
				sender: 'ai',
				text: 'Steps:\n1. Turn key\n2. Press start',
			},
		]);
		expect(harness.state.isLoading).toBe(false);

		MockEventSource.instances[0].emit('message', {
			data: JSON.stringify({
				id: 555,
				content: 'Final answer ::warning check battery',
				image_url: null,
			}),
		});
		await request;

		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'https://api.example.test/api/messages/555/chunks',
			expect.objectContaining({
				headers: {
					Accept: 'application/json',
					Authorization: 'Bearer test-token',
				},
			}),
		);
		expect(harness.state.messages[0].text).toBe('Final answer ::warning check battery');
		expect(harness.playAssistantAudio).toHaveBeenCalledWith('Final answer check battery');
		expect(harness.state.isLoading).toBe(false);
	});

	test('preserves spaces at the beginning of streamed chunks', async () => {
		const fetchMock = jest.mocked(global.fetch);
		fetchMock
			.mockResolvedValueOnce(createJsonResponse({ id: 123 }))
			.mockResolvedValueOnce(createJsonResponse([]));
		const harness = createHarness();

		const request = harness.api.askAPI('What is error E-23?');
		await flushPromises();

		MockEventSource.instances[0].emit('chunk', {
			data: 'E-23 oznacza',
		});
		MockEventSource.instances[0].emit('chunk', {
			data: ' hydraulic system error.',
		});

		expect(harness.state.messages[0].text).toBe(
			'E-23 oznacza hydraulic system error.',
		);

		MockEventSource.instances[0].emit('message', {
			data: JSON.stringify({
				id: 555,
				content: 'E-23 oznacza hydraulic system error.',
				image_url: null,
			}),
		});
		await request;
	});

	test('uses an existing thread and attaches source metadata with authorized chunk images', async () => {
		const fetchMock = jest.mocked(global.fetch);
		fetchMock
			.mockResolvedValueOnce(
				createJsonResponse([
					{
						attachment_id: 77,
						metadata: {
							images: ['manual/page 2.png'],
							page: 4,
						},
					},
				]),
			)
			.mockResolvedValueOnce(createImageResponse())
			.mockResolvedValueOnce(createJsonResponse({ original_filename: 'manual.pdf' }));
		const harness = createHarness({ currentThreadId: 321 });

		const request = harness.api.askAPI('Show source');
		await flushPromises();

		expect(fetchMock).not.toHaveBeenCalledWith(
			'https://api.example.test/api/threads',
			expect.anything(),
		);
		expect(MockEventSource.instances[0].url).toBe(
			'https://api.example.test/api/threads/321/messages',
		);

		MockEventSource.instances[0].emit('message', {
			data: JSON.stringify({
				id: 999,
				content: 'Use the diagram.',
				image_url: null,
			}),
		});
		await request;

		expect(fetchMock).toHaveBeenNthCalledWith(
			2,
			'https://api.example.test/api/images/manual%2Fpage%202.png',
			expect.objectContaining({
				headers: { Authorization: 'Bearer test-token' },
			}),
		);
		expect(fetchMock).toHaveBeenNthCalledWith(
			3,
			'https://api.example.test/api/attachments/77',
			expect.objectContaining({
				headers: {
					Accept: 'application/json',
					Authorization: 'Bearer test-token',
				},
			}),
		);
		expect(harness.state.currentImage).toBe('data:image/png;base64,aW1hZ2UtZGF0YQ==');
		expect(harness.state.messages[0]).toMatchObject({
			text: 'Use the diagram.',
			sourceAttachmentId: 77,
			sourceAttachmentName: 'manual.pdf',
			sourceAttachmentPage: 4,
			schemaImage: 'data:image/png;base64,aW1hZ2UtZGF0YQ==',
		});
	});

	test('reports auth errors from the SSE stream and removes the pending AI message', async () => {
		const harness = createHarness({ currentThreadId: 321 });

		const request = harness.api.askAPI('Unauthorized question');
		await flushPromises();

		MockEventSource.instances[0].emit('error', { xhrStatus: 403 });
		await request;

		expect(harness.onServiceError).toHaveBeenCalledWith(
			'autoryzacja aplikacji',
			expect.objectContaining({
				message: 'Invalid EXPO_PUBLIC_AUTH_TOKEN: 403',
				serviceFeature: 'autoryzacja aplikacji',
			}),
		);
		expect(harness.state.messages).toEqual([]);
		expect(harness.state.isGenerating).toBe(false);
		expect(harness.state.isLoading).toBe(false);
	});

	test('aborts in-flight requests and removes an empty AI placeholder', async () => {
		const harness = createHarness({ currentThreadId: 321 });

		harness.api.askAPI('Stop this request');
		await flushPromises();

		harness.api.stopChatApi();

		expect(MockEventSource.instances[0].close).toHaveBeenCalled();
		expect(harness.state.messages).toEqual([]);
		expect(harness.state.isGenerating).toBe(false);
		expect(harness.state.isLoading).toBe(false);
	});
});
