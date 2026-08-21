import { API_URL } from '@/utils/api-config';
import { onSessionInvalidated } from '@/utils/session-events';
import {
	clearStoredToken,
	getCachedToken,
	loadStoredToken,
	setStoredToken,
} from '@/utils/token-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface AuthUser {
	id: number;
	organizationId: number;
	organizationSlug: string;
	username: string;
	role: string;
}

interface UserReadDto {
	id: number;
	organization_id: number;
	organization_slug: string;
	username: string;
	role: string;
}

function toAuthUser(dto: UserReadDto): AuthUser {
	return {
		id: dto.id,
		organizationId: dto.organization_id,
		organizationSlug: dto.organization_slug,
		username: dto.username,
		role: dto.role,
	};
}

interface AuthContextValue {
	/** null while the initial stored-session check is in flight */
	authenticated: boolean | null;
	user: AuthUser | null;
	login: (organizationSlug: string, username: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [authenticated, setAuthenticated] = useState<boolean | null>(null);
	const [user, setUser] = useState<AuthUser | null>(null);

	useEffect(() => {
		// Any 401/403 from any authenticated fetch in the app calls this —
		// clears the stale token and flips `authenticated` to false, which the
		// root layout's redirect effect turns into a bounce to /login.
		onSessionInvalidated(() => {
			void clearStoredToken();
			setAuthenticated(false);
			setUser(null);
		});
		return () => onSessionInvalidated(null);
	}, []);

	useEffect(() => {
		(async () => {
			const token = await loadStoredToken();
			if (!token) {
				setAuthenticated(false);
				return;
			}
			try {
				const response = await fetch(`${API_URL}/auth/me`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const data: { authenticated: boolean; user: UserReadDto | null } =
					await response.json();
				if (data.authenticated && data.user) {
					setAuthenticated(true);
					setUser(toAuthUser(data.user));
				} else {
					await clearStoredToken();
					setAuthenticated(false);
				}
			} catch {
				// Can't reach the server at boot (tablet offline/on-site) — trust
				// the cached token rather than forcing a re-login on every
				// connectivity blip. A stale/revoked token still fails the next
				// real API call and surfaces normally from there.
				setAuthenticated(true);
			}
		})();
	}, []);

	const login = async (organizationSlug: string, username: string, password: string) => {
		const response = await fetch(`${API_URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ organization_slug: organizationSlug, username, password }),
		});
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(body?.detail ?? 'Nieprawidłowe dane logowania.');
		}
		const data: { token: string; user: UserReadDto } = await response.json();
		await setStoredToken(data.token);
		setAuthenticated(true);
		setUser(toAuthUser(data.user));
	};

	const logout = async () => {
		const token = getCachedToken();
		if (token) {
			await fetch(`${API_URL}/auth/logout`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` },
			}).catch(() => {});
		}
		await clearStoredToken();
		setAuthenticated(false);
		setUser(null);
	};

	return (
		<AuthContext.Provider value={{ authenticated, user, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error('useAuth must be used within AuthProvider');
	return ctx;
}
