import { api } from '@/lib/api'
import type { Category, CategoryTree } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useRootCategories() {
	return useQuery({
		queryKey: ['categories'],
		queryFn: () => api.get<Category[]>('/api/categories'),
	})
}

export function useCategoryTree() {
	return useQuery({
		queryKey: ['categories', 'tree'],
		queryFn: () => api.get<CategoryTree[]>('/api/categories/tree'),
	})
}

export function useCategory(categoryId: number) {
	return useQuery({
		queryKey: ['categories', categoryId],
		queryFn: () => api.get<Category>(`/api/categories/${categoryId}`),
	})
}

export function useCategoryChildren(categoryId: number, enabled = true) {
	return useQuery({
		queryKey: ['categories', categoryId, 'children'],
		queryFn: () => api.get<Category[]>(`/api/categories/${categoryId}/children`),
		enabled,
	})
}

export interface CategoryWriteBody {
	name: string
	image_url?: string | null
	parent_id?: number | null
}

export function useCreateCategory() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: CategoryWriteBody) => api.post<Category>('/api/categories', body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
	})
}

export function useUpdateCategory(categoryId: number) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (body: Partial<CategoryWriteBody>) =>
			api.patch<Category>(`/api/categories/${categoryId}`, body),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
	})
}

export function useDeleteCategory() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (categoryId: number) => api.delete(`/api/categories/${categoryId}`),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
	})
}
