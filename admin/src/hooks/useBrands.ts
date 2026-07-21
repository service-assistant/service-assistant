import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Brand } from '@/lib/types'

export function useBrands() {
	return useQuery({ queryKey: ['brands'], queryFn: () => api.get<Brand[]>('/api/brands') })
}

export function useBrand(brandId: number) {
	return useQuery({
		queryKey: ['brands', brandId],
		queryFn: () => api.get<Brand>(`/api/brands/${brandId}`),
	})
}

export function useCreateBrand() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: { name: string; logo_url?: string | null }) =>
			api.post<Brand>('/api/brands', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
	})
}

export function useUpdateBrand(brandId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: { name?: string; logo_url?: string | null }) =>
			api.patch<Brand>(`/api/brands/${brandId}`, body),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['brands'] })
		},
	})
}

export function useDeleteBrand() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (brandId: number) => api.delete(`/api/brands/${brandId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brands'] }),
	})
}
