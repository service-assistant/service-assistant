import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { DeviceRead } from '@/lib/types'

export function useDevices() {
	return useQuery({
		queryKey: ['devices'],
		queryFn: () => api.get<DeviceRead[]>('/api/devices'),
	})
}
