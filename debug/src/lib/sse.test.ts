import { describe, expect, it } from 'vitest'
import { parseSseBuffer, parseSseData } from './sse'

describe('parseSseBuffer', () => {
	it('parses a single complete event block', () => {
		const { events, rest } = parseSseBuffer('event: route\ndata: retrieval\n\n')
		expect(events).toEqual([{ event: 'route', data: 'retrieval' }])
		expect(rest).toBe('')
	})

	it('joins multi-line data payloads with newlines', () => {
		const { events } = parseSseBuffer('event: debug\ndata: {"a":1,\ndata: "b":2}\n\n')
		expect(events).toEqual([{ event: 'debug', data: '{"a":1,\n"b":2}' }])
	})

	it('keeps an incomplete trailing block as rest', () => {
		const { events, rest } = parseSseBuffer(
			'event: chunk\ndata: hello\n\nevent: chunk\ndata: wor',
		)
		expect(events).toEqual([{ event: 'chunk', data: 'hello' }])
		expect(rest).toBe('event: chunk\ndata: wor')
	})

	it('defaults to the "message" event when no event line is present', () => {
		const { events } = parseSseBuffer('data: plain\n\n')
		expect(events).toEqual([{ event: 'message', data: 'plain' }])
	})

	it('skips blank blocks', () => {
		const { events } = parseSseBuffer('\n\nevent: chunk\ndata: x\n\n')
		expect(events).toEqual([{ event: 'chunk', data: 'x' }])
	})
})

describe('parseSseData', () => {
	it('parses JSON payloads', () => {
		expect(parseSseData<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
	})

	it('falls back to the raw string for non-JSON payloads', () => {
		expect(parseSseData('route')).toBe('route')
	})

	it('returns an empty string for empty input', () => {
		expect(parseSseData('')).toBe('')
	})
})
