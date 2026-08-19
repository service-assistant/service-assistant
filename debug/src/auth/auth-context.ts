import { createContext } from 'react'

export interface AuthContextValue {
	/** null while the initial session check is in flight */
	authenticated: boolean | null
	login: (token: string) => Promise<void>
	logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
