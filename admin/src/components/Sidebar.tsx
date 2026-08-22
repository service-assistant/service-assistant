import { Link, useRouterState } from '@tanstack/react-router'
import {
	BookOpenCheck,
	Cpu,
	History,
	Settings,
	ShieldCheck,
	Wrench,
	type LucideIcon,
} from 'lucide-react'

type NavItem = {
	label: string
	to: '/' | '/catalog' | '/users' | '/settings' | null
	icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
	{ label: 'Baza wiedzy', to: '/', icon: BookOpenCheck },
	{ label: 'Katalog maszyn', to: '/catalog', icon: Wrench },
	{ label: 'Historia zmian', to: null, icon: History },
	{ label: 'Użytkownicy', to: '/users', icon: ShieldCheck },
]

const SETTINGS_ITEM: NavItem = { label: 'Ustawienia', to: '/settings', icon: Settings }

function SidebarItem({ active, item }: { active: boolean; item: NavItem }) {
	const Icon = item.icon
	const content = (
		<div
			className={`relative flex h-[43px] items-center px-[14px] transition-colors ${
				active ? 'bg-[#1b2633]' : 'hover:bg-[#1b2633]'
			} ${item.to === null ? 'cursor-not-allowed' : ''}`}>
			{active && (
				<span className='absolute top-[7px] bottom-[7px] left-0 w-[3px] rounded-r bg-[#ff7a00]' />
			)}
			<span
				className={`flex size-7 shrink-0 items-center justify-center rounded ${
					active ? 'bg-[rgba(255,122,0,0.12)] text-[#ff921f]' : 'text-[#9aa4b2]'
				}`}>
				<Icon size={18} strokeWidth={2.5} />
			</span>
			<span
				className={`ml-3 text-xs font-extrabold ${
					active ? 'text-[#ff921f]' : 'text-[#9aa4b2]'
				}`}>
				{item.label}
			</span>
		</div>
	)

	return item.to ? (
		<Link to={item.to} className='block'>
			{content}
		</Link>
	) : (
		<div aria-disabled='true'>{content}</div>
	)
}

export function Sidebar() {
	const pathname = useRouterState({ select: (state) => state.location.pathname })

	return (
		<aside className='flex h-screen w-[230px] shrink-0 flex-col overflow-hidden border-r border-white/[0.08] bg-[#111821] py-[18px]'>
			<header className='mb-4 border-b border-white/[0.08] px-5 pt-0 pb-[14px]'>
				<img src='/logo.png' alt='FixO' className='h-[18px] w-auto object-contain' />
				<p className='mt-1.5 text-[9px] font-bold tracking-[1.4px] text-[#9aa4b2] uppercase'>
					Panel administracyjny
				</p>
			</header>

			<nav className='flex flex-col gap-1' aria-label='Główna nawigacja'>
				{NAV_ITEMS.map((item) => {
					const active =
						item.to !== null &&
						(item.to === '/' ? pathname === '/' : pathname.startsWith(item.to))
					return <SidebarItem key={item.label} item={item} active={active} />
				})}
			</nav>

			<div className='mt-auto px-[14px]'>
				<div className='mb-5 rounded-md border border-white/[0.08] bg-[#151d27] px-4 py-4'>
					<div className='flex items-center'>
						<span className='mr-2 size-[7px] rounded-full bg-[#27d884]' />
						<span className='text-xs font-black text-[#e8eaed]'>Asystent aktywny</span>
					</div>
					<div className='mt-3 flex items-center'>
						<Cpu size={14} className='text-[#ff7a00]' strokeWidth={2.4} />
						<span className='ml-2 text-[11px] font-bold text-[#9aa4b2]'>
							Wersja bazy: 2026.06.30
						</span>
					</div>
				</div>
			</div>

			<div className='border-t border-white/[0.08] pt-5'>
				<SidebarItem item={SETTINGS_ITEM} active={pathname.startsWith('/settings')} />
			</div>
		</aside>
	)
}
