import { useEffect, useState, type ReactNode } from 'react'
import { API_URL } from '@/lib/api'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
	const [authenticated, setAuthenticated] = useState<boolean | null>(null)

	useEffect(() => {
		fetch(`${API_URL}/admin/session`, { credentials: 'include' })
			.then((res) => res.json())
			.then((data) => setAuthenticated(Boolean(data.authenticated)))
			.catch(() => setAuthenticated(false))
	}, [])

	const login = async (token: string) => {
		const res = await fetch(`${API_URL}/admin/login`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ token }),
		})
		if (!res.ok) {
			const data = await res.json().catch(() => null)
			throw new Error(data?.error ?? 'Nieprawidłowy token dostępu.')
		}
		setAuthenticated(true)
	}

	const logout = async () => {
		await fetch(`${API_URL}/admin/logout`, { method: 'POST', credentials: 'include' })
		setAuthenticated(false)
	}

	return <AuthContext.Provider value={{ authenticated, login, logout }}>{children}</AuthContext.Provider>
}
