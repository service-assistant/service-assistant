import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
	BenchmarkCaseListRead,
	BenchmarkCaseRun,
	BenchmarkDocumentStatus,
	BenchmarkSetupRun,
} from '@/lib/types'

/** Poll while a run/setup is still in flight; stop once it reaches a terminal state. */
function pollIntervalMs<T extends { state: string }>(data: T | null | undefined): number | false {
	if (!data) return false
	return data.state === 'queued' || data.state === 'processing' ? 1500 : false
}

export function useBenchmarkCases() {
	return useQuery({
		queryKey: ['benchmark', 'cases'],
		queryFn: () => api.get<BenchmarkCaseListRead>('/api/admin/benchmark/cases'),
	})
}

export function useStartCaseRun() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (caseId: string) =>
			api.post<BenchmarkCaseRun>(`/api/admin/benchmark/cases/${caseId}/runs`),
		onSuccess: (run) => queryClient.setQueryData(['benchmark', 'runs', run.id], run),
	})
}

export function useCaseRun(runId: string | null) {
	return useQuery({
		queryKey: ['benchmark', 'runs', runId],
		queryFn: () => api.get<BenchmarkCaseRun>(`/api/admin/benchmark/runs/${runId}`),
		enabled: runId !== null,
		refetchInterval: (query) => pollIntervalMs(query.state.data),
	})
}

export function useCancelCaseRun() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (runId: string) =>
			api.post<BenchmarkCaseRun>(`/api/admin/benchmark/runs/${runId}/cancel`),
		onSuccess: (run) => queryClient.setQueryData(['benchmark', 'runs', run.id], run),
	})
}

export function useDocumentStatus() {
	return useQuery({
		queryKey: ['benchmark', 'documents', 'status'],
		queryFn: () => api.get<BenchmarkDocumentStatus>('/api/admin/benchmark/documents/status'),
	})
}

export function useDownloadDocuments() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () =>
			api.post<BenchmarkDocumentStatus>('/api/admin/benchmark/documents/download'),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ['benchmark', 'documents', 'status'] }),
	})
}

export function useSetupRun() {
	return useQuery({
		queryKey: ['benchmark', 'setup'],
		queryFn: () => api.get<BenchmarkSetupRun | null>('/api/admin/benchmark/setup'),
		refetchInterval: (query) => pollIntervalMs(query.state.data),
	})
}

export function useStartSetupRun() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => api.post<BenchmarkSetupRun>('/api/admin/benchmark/setup'),
		onSuccess: (run) => queryClient.setQueryData(['benchmark', 'setup'], run),
	})
}
