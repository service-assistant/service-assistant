import { API_URL } from './api'

/**
 * Builds the URL for a chunk source image. `imagePath` looks like a single
 * path segment but is actually a full relative path (with slashes) that
 * FastAPI's `{path:path}` converter decodes back on the server — so it must
 * be `encodeURIComponent`-ed as a whole rather than segment by segment.
 * Mirrors `buildChunkImageUrl` in the Expo app's `utils/chat-stream.ts`.
 */
export function buildChunkImageUrl(imagePath: string): string {
	return `${API_URL}/api/images/${encodeURIComponent(imagePath)}`
}
