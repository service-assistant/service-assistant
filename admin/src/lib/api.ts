export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
	status: number
	constructor(status: number, message: string) {
		super(message)
		this.status = status
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const isFormData = options.body instanceof FormData
	const res = await fetch(`${BACKEND_URL}${path}`, {
		...options,
		credentials: 'include',
		headers: {
			...(!isFormData && options.body ? { 'Content-Type': 'application/json' } : {}),
			...options.headers,
		},
	})

	if (res.status === 401) {
		window.location.href = '/login'
		throw new ApiError(401, 'Unauthorized')
	}

	if (!res.ok) {
		const detail = await res.json().catch(() => null)
		throw new ApiError(res.status, detail?.detail ?? res.statusText)
	}

	if (res.status === 204) return undefined as T
	return res.json() as Promise<T>
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, {
			method: 'POST',
			body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
		}),
	patch: <T>(path: string, body: unknown) =>
		request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
