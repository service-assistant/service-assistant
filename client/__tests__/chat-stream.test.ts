import { buildChunkImageUrl, formatStreamingText, parseStreamData } from '../utils/chat-stream';

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
