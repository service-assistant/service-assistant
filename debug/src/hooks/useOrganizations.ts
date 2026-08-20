import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { OrganizationCreate, OrganizationCreateResponse, OrganizationRead } from '@/lib/types'

export function useOrganizations() {
	return useQuery({
		queryKey: ['organizations'],
		queryFn: () => api.get<OrganizationRead[]>('/api/admin/organizations'),
	})
}

export function useCreateOrganization() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: OrganizationCreate) =>
			api.post<OrganizationCreateResponse>('/api/admin/organizations', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
	})
}
