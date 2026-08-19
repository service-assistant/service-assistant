export interface SseEvent {
	event: string
	data: string
}

/**
 * Parses a raw text buffer accumulated from a streamed `text/event-stream`
 * response into complete `event: <name>\ndata: <payload>` blocks, per the
 * SSE spec (a payload may span multiple `data:` lines joined by `\n`).
 * Blocks are separated by a blank line (`\n\n`). Returns the parsed events
 * plus whatever trailing, not-yet-complete text should be kept for the next
 * chunk. Pure and side-effect free so it can be unit tested directly; see
 * `_sse()` in `api/app/routers/threads.py` for the exact server-side format.
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
	const blocks = buffer.split('\n\n')
	const rest = blocks.pop() ?? ''
	const events: SseEvent[] = []

	for (const block of blocks) {
		if (!block.trim()) continue

		let event = 'message'
		const dataLines: string[] = []
		for (const line of block.split('\n')) {
			if (line.startsWith('event:')) {
				event = line.slice('event:'.length).trim()
			} else if (line.startsWith('data:')) {
				dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
			}
		}
		events.push({ event, data: dataLines.join('\n') })
	}

	return { events, rest }
}

/** Parses a `data:` payload as JSON, falling back to the raw string if it isn't valid JSON. */
export function parseSseData<T>(data: string): T | string {
	if (!data) return ''
	try {
		return JSON.parse(data) as T
	} catch {
		return data
	}
}
