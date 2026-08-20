import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useUsers() {
	return useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/api/users') })
}

export interface UserCreateBody {
	username: string
	password: string
	org_role?: 'member' | 'admin'
}

export function useCreateUser() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: UserCreateBody) => api.post<User>('/api/users', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
	})
}
