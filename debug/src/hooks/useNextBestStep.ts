import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ChatThreadRead } from '@/lib/types'

export function useCreateThread() {
	return useMutation({
		mutationFn: (body: { device_id: number; title: string }) =>
			api.post<ChatThreadRead>('/api/admin/next-best-step/threads', body),
	})
}
