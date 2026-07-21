import { Link, useRouterState } from '@tanstack/react-router'
import { BookOpen, History, LogOut, Settings, Users, Wrench } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'

const NAV_ITEMS = [
	{ label: 'Baza wiedzy', to: '/', icon: BookOpen },
	{ label: 'Katalog maszyn', to: '/catalog', icon: Wrench },
	{ label: 'Historia zmian', to: null, icon: History },
	{ label: 'Użytkownicy', to: '/users', icon: Users },
	{ label: 'Ustawienia', to: null, icon: Settings },
] as const

export function Sidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const { logout } = useAuth()

	return (
		<aside className="flex w-[230px] shrink-0 flex-col justify-between border-r border-line bg-panel px-4 py-6">
			<div>
				<div className="mb-8 px-2 text-lg font-semibold text-cream">Asystent Serwisanta</div>
				<nav className="flex flex-col gap-1">
					{NAV_ITEMS.map(({ label, to, icon: Icon }) => {
						const active = to !== null && (to === '/' ? pathname === '/' : pathname.startsWith(to))
						const content = (
							<div
								className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm ${
									active
										? 'border-ember bg-panel-soft text-cream'
										: 'border-transparent text-cream/60 hover:bg-panel-soft hover:text-cream'
								} ${to === null ? 'cursor-not-allowed opacity-40' : ''}`}
							>
								<Icon size={16} />
								{label}
							</div>
						)
						return to ? (
							<Link key={label} to={to}>
								{content}
							</Link>
						) : (
							<div key={label}>{content}</div>
						)
					})}
				</nav>
			</div>

			<div className="flex flex-col gap-3">
				<div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-xs text-cream/70">
					<span className="mr-2 inline-block size-2 rounded-full bg-emerald-400" />
					Asystent aktywny
				</div>
				<button
					onClick={() => void logout()}
					className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-cream/60 hover:bg-panel-soft hover:text-cream"
				>
					<LogOut size={16} />
					Wyloguj
				</button>
			</div>
		</aside>
	)
}
