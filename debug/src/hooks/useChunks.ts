import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ChunkRead, DebugChunkFileDetailRead, DebugChunkFileRead } from '@/lib/types'

export function useChunkFiles(search: string) {
	const query = search.trim()
	return useQuery({
		queryKey: ['debug-chunks', 'files', query],
		queryFn: () =>
			api.get<DebugChunkFileRead[]>(
				`/api/admin/chunks/files${query ? `?search=${encodeURIComponent(query)}` : ''}`,
			),
	})
}

export function useChunkFile(attachmentId: number) {
	return useQuery({
		queryKey: ['debug-chunks', 'files', attachmentId],
		queryFn: () => api.get<DebugChunkFileDetailRead>(`/api/admin/chunks/files/${attachmentId}`),
		enabled: Number.isInteger(attachmentId) && attachmentId > 0,
	})
}

export function usePageChunks(attachmentId: number, pageNumber: number) {
	return useQuery({
		queryKey: ['debug-chunks', 'files', attachmentId, 'page', pageNumber],
		queryFn: () =>
			api.get<ChunkRead[]>(
				`/api/admin/chunks/files/${attachmentId}/chunks?page_number=${pageNumber}`,
			),
		enabled: Number.isInteger(attachmentId) && attachmentId > 0 && pageNumber > 0,
	})
}
