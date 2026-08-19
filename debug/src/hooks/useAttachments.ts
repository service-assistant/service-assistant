import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { AttachmentRead } from '@/lib/types'

export function useAttachments() {
	return useQuery({
		queryKey: ['attachments'],
		queryFn: () => api.get<AttachmentRead[]>('/api/attachments'),
	})
}
