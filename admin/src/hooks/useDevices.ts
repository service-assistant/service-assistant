import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Attachment, Device } from '@/lib/types'

export function useDevices() {
	return useQuery({ queryKey: ['devices'], queryFn: () => api.get<Device[]>('/api/devices') })
}

export function useDevice(deviceId: number) {
	return useQuery({
		queryKey: ['devices', deviceId],
		queryFn: () => api.get<Device>(`/api/devices/${deviceId}`),
	})
}

export function useDeviceAttachments(deviceId: number) {
	return useQuery({
		queryKey: ['devices', deviceId, 'attachments'],
		queryFn: () => api.get<Attachment[]>(`/api/devices/${deviceId}/attachments`),
	})
}

export interface DeviceCreateBody {
	brand_id: number
	device_type_id: number
	name: string
	model_serial_code?: string | null
	image_url?: string | null
}

export function useCreateDevice() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: DeviceCreateBody) => api.post<Device>('/api/devices', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
	})
}

export function useUpdateDevice(deviceId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: Partial<DeviceCreateBody>) =>
			api.patch<Device>(`/api/devices/${deviceId}`, body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
	})
}

export function useDeleteDevice() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (deviceId: number) => api.delete(`/api/devices/${deviceId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
	})
}
