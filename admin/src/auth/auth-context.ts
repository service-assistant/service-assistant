import { createContext } from 'react'

export interface AuthUser {
	id: number
	organizationId: number
	organizationSlug: string
	username: string
	appRole: string
	orgRole: string
}

export interface AuthContextValue {
	/** null while the initial session check is in flight */
	authenticated: boolean | null
	user: AuthUser | null
	login: (organizationSlug: string, username: string, password: string) => Promise<void>
	logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
