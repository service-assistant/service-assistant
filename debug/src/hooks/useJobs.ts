import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { JobListRead } from '@/lib/types'

export function useJobs(page: number) {
	return useQuery({
		queryKey: ['jobs', page],
		queryFn: () => api.get<JobListRead>(`/api/jobs?page=${page}`),
	})
}
