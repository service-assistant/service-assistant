import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { useQuery } from '@tanstack/react-query'

export function useUsers() {
	return useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/users') })
}
