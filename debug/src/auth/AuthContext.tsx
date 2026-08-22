import { type ReactNode, useEffect, useState } from 'react'
import { API_URL } from '@/lib/api'
import { AuthContext, type AuthUser } from './auth-context'

interface UserReadDto {
	id: number
	organization_id: number
	organization_slug: string
	username: string
	app_role: string
	org_role: string
}

function toAuthUser(dto: UserReadDto): AuthUser {
	return {
		id: dto.id,
		organizationId: dto.organization_id,
		organizationSlug: dto.organization_slug,
		username: dto.username,
		appRole: dto.app_role,
		orgRole: dto.org_role,
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [authenticated, setAuthenticated] = useState<boolean | null>(null)
	const [user, setUser] = useState<AuthUser | null>(null)

	useEffect(() => {
		fetch(`${API_URL}/auth/me`, {
			credentials: 'include',
			headers: { 'X-Auth-Scope': 'admin' },
		})
			.then((res) => res.json())
			.then((data: { authenticated: boolean; user: UserReadDto | null }) => {
				const isAppAdmin = Boolean(data.authenticated) && data.user?.app_role === 'admin'
				setAuthenticated(isAppAdmin)
				setUser(isAppAdmin && data.user ? toAuthUser(data.user) : null)
			})
			.catch(() => setAuthenticated(false))
	}, [])

	const login = async (username: string, password: string) => {
		const res = await fetch(`${API_URL}/admin/auth/login`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username, password }),
		})
		if (!res.ok) {
			const data = await res.json().catch(() => null)
			throw new Error(data?.detail ?? 'Nieprawidłowe dane logowania.')
		}
		const data: { user: UserReadDto } = await res.json()
		setAuthenticated(true)
		setUser(toAuthUser(data.user))
	}

	const logout = async () => {
		await fetch(`${API_URL}/admin/auth/logout`, { method: 'POST', credentials: 'include' })
		setAuthenticated(false)
		setUser(null)
	}

	return (
		<AuthContext.Provider value={{ authenticated, user, login, logout }}>
			{children}
		</AuthContext.Provider>
	)
}
