import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DeviceType } from '@/lib/types'

export function useDeviceTypes() {
	return useQuery({
		queryKey: ['deviceTypes'],
		queryFn: () => api.get<DeviceType[]>('/api/device_types'),
	})
}

export function useDeviceType(deviceTypeId: number) {
	return useQuery({
		queryKey: ['deviceTypes', deviceTypeId],
		queryFn: () => api.get<DeviceType>(`/api/device_types/${deviceTypeId}`),
	})
}

export function useCreateDeviceType() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: { name: string }) => api.post<DeviceType>('/api/device_types', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deviceTypes'] }),
	})
}

export function useUpdateDeviceType(deviceTypeId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: { name?: string }) =>
			api.patch<DeviceType>(`/api/device_types/${deviceTypeId}`, body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deviceTypes'] }),
	})
}

export function useDeleteDeviceType() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (deviceTypeId: number) => api.delete(`/api/device_types/${deviceTypeId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['deviceTypes'] }),
	})
}
