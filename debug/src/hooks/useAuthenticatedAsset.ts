import { useEffect, useState } from 'react'
import { API_URL } from '@/lib/api'

export function useAuthenticatedAsset(path: string | undefined, enabled = true) {
	const [url, setUrl] = useState<string>()
	const [error, setError] = useState(false)

	useEffect(() => {
		if (!path || !enabled) return
		const controller = new AbortController()
		let objectUrl: string | undefined
		setUrl(undefined)
		setError(false)

		void fetch(`${API_URL}${path}`, {
			credentials: 'include',
			headers: { 'X-Auth-Scope': 'admin' },
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				return response.blob()
			})
			.then((blob) => {
				objectUrl = URL.createObjectURL(blob)
				setUrl(objectUrl)
			})
			.catch((loadError: unknown) => {
				if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) {
					setError(true)
				}
			})

		return () => {
			controller.abort()
			if (objectUrl) URL.revokeObjectURL(objectUrl)
		}
	}, [enabled, path])

	return { error, url }
}
