import {
	appendStreamingChunk,
	buildChunkImageUrl,
	formatStreamingText,
	parseStreamData,
} from '../utils/chat-stream';

describe('parseStreamData', () => {
	test('returns an empty string for empty stream payloads', () => {
		expect(parseStreamData(null)).toBe('');
		expect(parseStreamData('')).toBe('');
	});

	test('parses JSON payloads', () => {
		expect(parseStreamData<{ content: string }>('{"content":"hello"}')).toEqual({
			content: 'hello',
		});
	});

	test('keeps raw text when payload is not JSON', () => {
		expect(parseStreamData('plain chunk')).toBe('plain chunk');
	});
});

describe('buildChunkImageUrl', () => {
	test('encodes image paths for the API route', () => {
		expect(buildChunkImageUrl('https://api.example.test', 'folder/page 1.png')).toBe(
			'https://api.example.test/api/images/folder%2Fpage%201.png',
		);
	});
});

describe('appendStreamingChunk', () => {
	test('restores a missing newline before each streamed checklist marker', () => {
		const firstItem = appendStreamingChunk('::checklist\n', '- Sprawdź olej');
		const secondItem = appendStreamingChunk(firstItem, '- Sprawdź przewody');

		expect(secondItem).toBe('::checklist\n- Sprawdź olej\n- Sprawdź przewody');
	});

	test('restores checklist newlines when streamed markers contain leading whitespace', () => {
		const result = appendStreamingChunk('::checklist\n- Sprawdź olej', '  - Sprawdź przewody');

		expect(result).toBe('::checklist\n- Sprawdź olej\n- Sprawdź przewody');
	});

	test('starts a new streamed checklist row even when only the marker has arrived', () => {
		expect(appendStreamingChunk('::checklist\n- Pierwszy krok', '-')).toBe(
			'::checklist\n- Pierwszy krok\n-',
		);
	});

	test('does not insert a newline outside an active checklist', () => {
		expect(appendStreamingChunk('Zakres 54 ', '- 66 omów')).toBe('Zakres 54 - 66 omów');
		expect(appendStreamingChunk('::warning\nUwaga ', '- stop')).toBe('::warning\nUwaga - stop');
	});

	test('does not split a streamed numeric range inside a checklist', () => {
		expect(appendStreamingChunk('::checklist\n- Zakres 54 ', '- 66 omów')).toBe(
			'::checklist\n- Zakres 54 - 66 omów',
		);
	});
});

describe('formatStreamingText', () => {
	test('puts numbered list items on separate lines after an introducing colon', () => {
		expect(formatStreamingText('Steps: 1. Open panel 2. Press save')).toBe(
			'Steps:\n1. Open panel\n2. Press save',
		);
	});

	test('supports parenthesized list markers', () => {
		expect(formatStreamingText('Steps: 1) Open panel 2) Press save')).toBe(
			'Steps:\n1) Open panel\n2) Press save',
		);
	});

	test('does not split decimal numbers or unrelated numbering', () => {
		expect(formatStreamingText('Version 2.0 is ready. Then item 7. stays inline')).toBe(
			'Version 2.0 is ready. Then item 7. stays inline',
		);
	});

	test('does not continue a list when numbering skips a value', () => {
		expect(formatStreamingText('Steps: 1. Open panel 3. Press save')).toBe(
			'Steps:\n1. Open panel 3. Press save',
		);
	});
});
