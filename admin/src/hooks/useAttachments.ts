import { api, API_URL } from '@/lib/api'
import type { Attachment, Device } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useAttachments() {
	return useQuery({
		queryKey: ['attachments'],
		queryFn: () => api.get<Attachment[]>('/api/attachments'),
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

export function useCreateAttachment() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ file, deviceIds }: { file: File; deviceIds: number[] }) => {
			const form = new FormData()
			form.append('file', file)
			for (const id of deviceIds) form.append('device_ids', String(id))
			return api.post<Attachment>('/api/attachments', form)
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
		onSuccess: (_data, { attachmentId }) =>
			queryClient.invalidateQueries({ queryKey: ['attachments', attachmentId, 'devices'] }),
	})
}

export function useUnlinkDevice() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ attachmentId, deviceId }: { attachmentId: number; deviceId: number }) =>
			api.delete(`/api/attachments/${attachmentId}/devices/${deviceId}`),
		onSuccess: (_data, { attachmentId }) =>
			queryClient.invalidateQueries({ queryKey: ['attachments', attachmentId, 'devices'] }),
	})
}
