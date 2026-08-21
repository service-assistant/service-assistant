import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DebugMessageDeviceRead, DebugMessageThreadRead, MessageRead } from '@/lib/types'

export function useMessageThreads(search: string) {
	const query = search.trim()
	return useQuery({
		queryKey: ['debug-messages', 'threads', query],
		queryFn: () =>
			api.get<DebugMessageThreadRead[]>(
				`/api/admin/messages/threads${query ? `?search=${encodeURIComponent(query)}` : ''}`,
			),
	})
}

export function useMessageDevices() {
	return useQuery({
		queryKey: ['debug-messages', 'devices'],
		queryFn: () => api.get<DebugMessageDeviceRead[]>('/api/admin/messages/devices'),
	})
}

export function useMessageThread(threadId: number) {
	return useQuery({
		queryKey: ['debug-messages', 'threads', threadId],
		queryFn: () => api.get<DebugMessageThreadRead>(`/api/admin/messages/threads/${threadId}`),
		enabled: Number.isInteger(threadId) && threadId > 0,
	})
}

export function useThreadMessages(threadId: number) {
	return useQuery({
		queryKey: ['debug-messages', 'threads', threadId, 'messages'],
		queryFn: () => api.get<MessageRead[]>(`/api/admin/messages/threads/${threadId}/messages`),
		enabled: Number.isInteger(threadId) && threadId > 0,
	})
}

export function useCreateMessageThread() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: { device_id: number; title: string }) =>
			api.post<DebugMessageThreadRead>('/api/admin/messages/threads', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['debug-messages', 'threads'] }),
	})
}
