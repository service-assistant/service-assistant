export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
	status: number
	constructor(status: number, message: string) {
		super(message)
		this.status = status
	}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${API_URL}${path}`, {
		...options,
		credentials: 'include',
		headers: {
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...options.headers,
		},
	})

	if (res.status === 401) {
		window.location.href = '/login'
		throw new ApiError(401, 'Unauthorized')
	}

	const responseText = await res.text()
	let responseBody: unknown
	try {
		responseBody = responseText ? JSON.parse(responseText) : undefined
	} catch {
		responseBody = undefined
	}

	if (!res.ok) {
		const detail =
			typeof responseBody === 'object' && responseBody !== null && 'detail' in responseBody
				? String(responseBody.detail)
				: responseText || res.statusText
		throw new ApiError(res.status, detail)
	}

	if (res.status === 204 || !responseText) return undefined as T
	return responseBody as T
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, {
			method: 'POST',
			body: body !== undefined ? JSON.stringify(body) : undefined,
		}),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
