import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ChunkRead } from '@/lib/types'

export function useChunks(attachmentId: number | null, page: number) {
	return useQuery({
		queryKey: ['chunks', attachmentId, page],
		queryFn: () => {
			const params = new URLSearchParams({ page: String(page) })
			if (attachmentId !== null) params.set('attachment_id', String(attachmentId))
			return api.get<ChunkRead[]>(`/api/chunks?${params.toString()}`)
		},
	})
}

export function useDeleteChunk() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (chunkId: number) => api.delete(`/api/chunks/${chunkId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chunks'] }),
	})
}
