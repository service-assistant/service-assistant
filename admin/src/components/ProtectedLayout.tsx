import { useAuth } from '@/auth/use-auth'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { ToastRegion } from './ToastRegion'

export function ProtectedLayout() {
	const { authenticated } = useAuth()
	const navigate = useNavigate()

	useEffect(() => {
		if (authenticated === false) void navigate({ to: '/login' })
	}, [authenticated, navigate])

	if (authenticated !== true) {
		return (
			<div className='flex min-h-screen items-center justify-center text-cream/60'>
				Ładowanie…
			</div>
		)
	}

	return (
		<div className='flex h-screen overflow-hidden'>
			<Sidebar />
			<main className='h-screen flex-1 overflow-auto p-8'>
				<Outlet />
			</main>
			<ToastRegion />
		</div>
	)
}
