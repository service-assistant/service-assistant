import { AppShell, Button, NavLink, Stack, Title } from '@mantine/core'
import {
	IconClipboardList,
	IconFlask,
	IconLogout,
	IconMessages,
	IconPuzzle,
	IconRoute,
} from '@tabler/icons-react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAuth } from '@/auth/use-auth'

const links = [
	{ to: '/chunks', label: 'Chunki', icon: IconPuzzle },
	{ to: '/threads', label: 'Wątki', icon: IconMessages },
	{ to: '/jobs', label: 'Zadania w tle', icon: IconClipboardList },
	{ to: '/benchmark', label: 'Benchmark', icon: IconFlask },
	{ to: '/next-best-step', label: 'Next Best Step', icon: IconRoute },
] as const

export function Sidebar() {
	const { logout } = useAuth()
	const pathname = useRouterState({ select: (s) => s.location.pathname })

	return (
		<AppShell.Navbar p='md'>
			<Stack justify='space-between' h='100%'>
				<Stack gap='xs'>
					<Title order={4} mb='sm'>
						Debug
					</Title>
					{links.map((link) => (
						<NavLink
							key={link.to}
							component={Link}
							to={link.to}
							label={link.label}
							leftSection={<link.icon size={18} />}
							active={pathname.startsWith(link.to)}
						/>
					))}
				</Stack>
				<Button
					variant='subtle'
					color='gray'
					leftSection={<IconLogout size={18} />}
					onClick={() => void logout()}>
					Wyloguj
				</Button>
			</Stack>
		</AppShell.Navbar>
	)
}
