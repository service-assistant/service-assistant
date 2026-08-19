import { AppShell, Center, Loader } from '@mantine/core'
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
		return (
			<Center mih='100vh'>
				<Loader />
			</Center>
		)
	}

	return (
		<AppShell navbar={{ width: 240, breakpoint: 'sm' }} padding='md'>
			<Sidebar />
			<AppShell.Main>
				<Outlet />
			</AppShell.Main>
		</AppShell>
	)
}
