import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
	OrganizationCreate,
	OrganizationCreateResponse,
	OrganizationRead,
	OrganizationUpdate,
} from '@/lib/types'

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

export function useUpdateOrganization() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: ({ id, body }: { id: number; body: OrganizationUpdate }) =>
			api.patch<OrganizationRead>(`/api/admin/organizations/${id}`, body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
	})
}

export function useDeleteOrganization() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (organizationId: number) =>
			api.delete(`/api/admin/organizations/${organizationId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
	})
}
