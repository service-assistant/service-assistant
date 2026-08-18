import { api } from '@/lib/api'
import type { Attachment } from '@/lib/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Queues an attachment for ingestion — covers the first run, a manual
 * reprocess, and a retry after failure alike (all the same backend action).
 */
export function useStartIngestion() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (attachmentId: number) =>
			api.post<Attachment>(`/api/attachments/${attachmentId}/ingest`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
	})
}

export function useCancelIngestion() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (attachmentId: number) =>
			api.post<Attachment>(`/api/attachments/${attachmentId}/cancel`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
	})
}

/** Queues every attachment currently `ready`, one request per file. */
export function useProcessReadyAttachments() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async (readyAttachments: Attachment[]) => {
			for (const attachment of readyAttachments) {
				await api.post(`/api/attachments/${attachment.id}/ingest`)
			}
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
	})
}
