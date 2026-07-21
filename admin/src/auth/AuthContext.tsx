import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { BACKEND_URL } from '@/lib/api'

interface AuthContextValue {
	/** null while the initial session check is in flight */
	authenticated: boolean | null
	login: (token: string) => Promise<void>
	logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
	const [authenticated, setAuthenticated] = useState<boolean | null>(null)

	useEffect(() => {
		fetch(`${BACKEND_URL}/admin/session`, { credentials: 'include' })
			.then((res) => res.json())
			.then((data) => setAuthenticated(Boolean(data.authenticated)))
			.catch(() => setAuthenticated(false))
	}, [])

	const login = async (token: string) => {
		const res = await fetch(`${BACKEND_URL}/admin/login`, {
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
		await fetch(`${BACKEND_URL}/admin/logout`, { method: 'POST', credentials: 'include' })
		setAuthenticated(false)
	}

	return <AuthContext.Provider value={{ authenticated, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within AuthProvider')
	return ctx
}
