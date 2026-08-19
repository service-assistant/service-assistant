import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ChunkRead, MessageRead } from '@/lib/types'

export function useThreadMessages(threadId: number) {
	return useQuery({
		queryKey: ['threads', threadId, 'messages'],
		queryFn: () => api.get<MessageRead[]>(`/api/threads/${threadId}/messages`),
	})
}

export function useMessageChunks(messageId: number, enabled: boolean) {
	return useQuery({
		queryKey: ['messages', messageId, 'chunks'],
		queryFn: () => api.get<ChunkRead[]>(`/api/messages/${messageId}/chunks`),
		enabled,
	})
}
