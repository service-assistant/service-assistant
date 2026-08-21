import { useAuth } from '@/auth/use-auth'
import { Building2, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'

const ROLE_LABELS: Record<string, string> = {
	admin: 'Administrator organizacji',
	member: 'Członek organizacji',
}

export function SettingsPage() {
	const { user, logout } = useAuth()
	const [isLoggingOut, setIsLoggingOut] = useState(false)

	async function handleLogout() {
		if (isLoggingOut) return
		setIsLoggingOut(true)
		await logout()
	}

	return (
		<div className='mx-auto w-full max-w-3xl'>
			<div className='mb-6'>
				<h1 className='text-2xl font-semibold text-cream'>Ustawienia</h1>
				<p className='mt-1 text-sm text-cream/50'>Zarządzaj bieżącą sesją w panelu.</p>
			</div>

			<section className='overflow-hidden rounded-lg border border-line bg-panel'>
				<div className='border-b border-line px-6 py-5'>
					<h2 className='text-base font-semibold text-cream'>Konto</h2>
					<p className='mt-1 text-sm text-cream/45'>
						Informacje o zalogowanym użytkowniku.
					</p>
				</div>

				<div className='grid gap-4 px-6 py-5 sm:grid-cols-2'>
					<div className='flex items-center gap-3 rounded-md border border-line bg-ink/40 px-4 py-3'>
						<span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-ember/10 text-ember'>
							<UserRound size={18} />
						</span>
						<div className='min-w-0'>
							<p className='text-xs font-medium tracking-wide text-cream/40 uppercase'>
								Użytkownik
							</p>
							<p className='truncate text-sm font-semibold text-cream'>
								{user?.username}
							</p>
							<p className='truncate text-xs text-cream/45'>
								{ROLE_LABELS[user?.orgRole ?? ''] ?? user?.orgRole}
							</p>
						</div>
					</div>

					<div className='flex items-center gap-3 rounded-md border border-line bg-ink/40 px-4 py-3'>
						<span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-ember/10 text-ember'>
							<Building2 size={18} />
						</span>
						<div className='min-w-0'>
							<p className='text-xs font-medium tracking-wide text-cream/40 uppercase'>
								Organizacja
							</p>
							<p className='truncate text-sm font-semibold text-cream'>
								{user?.organizationSlug}
							</p>
						</div>
					</div>
				</div>

				<div className='flex items-center justify-between gap-6 border-t border-line px-6 py-5'>
					<div>
						<p className='text-sm font-semibold text-cream'>Wylogowanie</p>
						<p className='mt-1 text-xs text-cream/45'>
							Zakończ bieżącą sesję i wróć do ekranu logowania.
						</p>
					</div>
					<button
						type='button'
						onClick={() => void handleLogout()}
						disabled={isLoggingOut}
						className='flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-red-400/35 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-400/15 disabled:cursor-wait disabled:opacity-60'>
						<LogOut size={17} />
						{isLoggingOut ? 'Wylogowywanie…' : 'Wyloguj się'}
					</button>
				</div>
			</section>
		</div>
	)
}
