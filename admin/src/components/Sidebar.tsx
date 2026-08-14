import { Link, useRouterState } from '@tanstack/react-router'
import { BookOpen, Cog, History, LogOut, Settings, Shield, Wrench } from 'lucide-react'
import { useAuth } from '@/auth/use-auth'

const NAV_ITEMS = [
	{ label: 'Baza wiedzy', to: '/', icon: BookOpen },
	{ label: 'Katalog maszyn', to: '/catalog', icon: Wrench },
	{ label: 'Historia zmian', to: null, icon: History },
	{ label: 'Użytkownicy', to: '/users', icon: Shield },
] as const

export function Sidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname })
	const { logout } = useAuth()

	return (
		<aside className="flex w-[230px] shrink-0 flex-col justify-between border-r border-line bg-panel px-4 py-6">
			<div>
				<div className="mb-8 px-2">
					<div className="text-xl font-extrabold tracking-tight text-cream">
						Fi<span className="text-ember">x</span>O
					</div>
					<div className="text-[10px] font-medium tracking-widest text-cream/40 uppercase">
						Panel administracyjny
					</div>
				</div>
				<nav className="flex flex-col gap-1">
					{NAV_ITEMS.map(({ label, to, icon: Icon }) => {
						const active = to !== null && (to === '/' ? pathname === '/' : pathname.startsWith(to))
						const content = (
							<div
								className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-[15px] font-semibold ${
									active
										? 'border-ember bg-panel-soft text-cream'
										: 'border-transparent text-cream/60 hover:bg-panel-soft hover:text-cream'
								} ${to === null ? 'cursor-not-allowed' : ''}`}
							>
								<span
									className={`flex size-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-ember/15 text-ember' : ''}`}
								>
									<Icon size={16} />
								</span>
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
				<div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-xs">
					<div className="flex items-center gap-2 font-semibold text-cream">
						<span className="inline-block size-2 rounded-full bg-emerald-400" />
						Asystent aktywny
					</div>
					<div className="mt-1 flex items-center gap-1.5 text-cream/40">
						<Cog size={12} />
						Wersja bazy: 2026.06.30
					</div>
				</div>
				<div className="flex flex-col gap-1">
					<div className="flex cursor-not-allowed items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-[15px] font-semibold text-cream/60">
						<span className="flex size-7 shrink-0 items-center justify-center">
							<Settings size={16} />
						</span>
						Ustawienia
					</div>
					<button
						onClick={() => void logout()}
						className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-cream/60 hover:bg-panel-soft hover:text-cream"
					>
						<LogOut size={16} />
						Wyloguj
					</button>
				</div>
			</div>
		</aside>
	)
}
