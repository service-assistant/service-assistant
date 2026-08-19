import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ChatThreadRead } from '@/lib/types'

export function useThreads() {
	return useQuery({
		queryKey: ['threads'],
		queryFn: () => api.get<ChatThreadRead[]>('/api/threads'),
	})
}

export function useThread(threadId: number) {
	return useQuery({
		queryKey: ['threads', threadId],
		queryFn: () => api.get<ChatThreadRead>(`/api/threads/${threadId}`),
	})
}

export function useCreateThread() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: { device_id: number; title: string }) =>
			api.post<ChatThreadRead>('/api/threads', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['threads'] }),
	})
}
