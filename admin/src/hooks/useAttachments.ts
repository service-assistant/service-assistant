import { api, API_URL } from '@/lib/api'
import { pollIntervalMs } from '@/lib/ingestion'
import type { Attachment, Device } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

/** Polls only while some attachment is queued or running. */
export function useAttachments() {
	return useQuery({
		queryKey: ['attachments'],
		queryFn: () => api.get<Attachment[]>('/api/attachments'),
		refetchInterval: (query) => pollIntervalMs(query.state.data),
	})
}

export function useAttachment(attachmentId: number) {
	return useQuery({
		queryKey: ['attachments', attachmentId],
		queryFn: () => api.get<Attachment>(`/api/attachments/${attachmentId}`),
	})
}

export function useAttachmentDevices(attachmentId: number) {
	return useQuery({
		queryKey: ['attachments', attachmentId, 'devices'],
		queryFn: () => api.get<Device[]>(`/api/attachments/${attachmentId}/devices`),
	})
}

export function attachmentFileUrl(attachmentId: number): string {
	return `${API_URL}/api/attachments/${attachmentId}/file`
}

/**
 * Uploads files. Nothing is ingested yet — they land with `ingest_status:
 * 'ready'` and wait for an explicit process action. Sent one request at a
 * time so a slow file doesn't block the others from appearing.
 */
export function useCreateAttachment() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: async ({ files, deviceIds }: { files: File[]; deviceIds: number[] }) => {
			const uploaded: Attachment[] = []
			for (const file of files) {
				const form = new FormData()
				form.append('files', file)
				for (const id of deviceIds) form.append('device_ids', String(id))
				uploaded.push(...(await api.post<Attachment[]>('/api/attachments', form)))
			}
			return uploaded
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
	})
}

export function useDeleteAttachment() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (attachmentId: number) => api.delete(`/api/attachments/${attachmentId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attachments'] }),
	})
}

export function useLinkDevice() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ attachmentId, deviceId }: { attachmentId: number; deviceId: number }) =>
			api.post(`/api/attachments/${attachmentId}/devices/${deviceId}`),
		onSuccess: (_data, { attachmentId, deviceId }) =>
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: ['attachments', attachmentId, 'devices'],
				}),
				queryClient.invalidateQueries({ queryKey: ['devices', deviceId, 'attachments'] }),
			]),
	})
}

export function useUnlinkDevice() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ attachmentId, deviceId }: { attachmentId: number; deviceId: number }) =>
			api.delete(`/api/attachments/${attachmentId}/devices/${deviceId}`),
		onSuccess: (_data, { attachmentId, deviceId }) =>
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: ['attachments', attachmentId, 'devices'],
				}),
				queryClient.invalidateQueries({ queryKey: ['devices', deviceId, 'attachments'] }),
			]),
	})
}
