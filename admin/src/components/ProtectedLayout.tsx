import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/auth/use-auth'
import { Sidebar } from './Sidebar'

export function ProtectedLayout() {
	const { authenticated } = useAuth()
	const navigate = useNavigate()

	useEffect(() => {
		if (authenticated === false) void navigate({ to: '/login' })
	}, [authenticated, navigate])

	if (authenticated !== true) {
		return <div className="flex min-h-screen items-center justify-center text-cream/60">Ładowanie…</div>
	}

	return (
		<div className="flex min-h-screen">
			<Sidebar />
			<main className="flex-1 overflow-x-auto p-8">
				<Outlet />
			</main>
		</div>
	)
}
