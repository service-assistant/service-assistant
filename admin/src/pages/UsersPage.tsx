import { useUsers } from '@/hooks/useUsers'
import { Link } from '@tanstack/react-router'

const ORG_ROLE_LABELS: Record<string, string> = {
	admin: 'Administrator organizacji',
	member: 'Członek organizacji',
}

export function UsersPage() {
	const { data: users, isLoading } = useUsers()

	return (
		<div>
			<div className='mb-6 flex items-center justify-between'>
				<h1 className='text-2xl font-semibold text-cream'>Użytkownicy</h1>
				<Link
					to='/users/new'
					className='rounded bg-cream px-4 py-2 text-sm font-medium text-black'>
					+ Dodaj użytkownika
				</Link>
			</div>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_2fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Login</span>
					<span>Rola</span>
				</div>
				{isLoading && <div className='px-4 py-3 text-sm text-cream/50'>Ładowanie…</div>}
				{!isLoading && (users ?? []).length === 0 && (
					<div className='px-4 py-3 text-sm text-cream/50'>Brak użytkowników.</div>
				)}
				{(users ?? []).map((user) => (
					<div
						key={user.id}
						className='grid grid-cols-[2fr_2fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0'>
						<span className='text-cream'>{user.username}</span>
						<span>{ORG_ROLE_LABELS[user.org_role] ?? user.org_role}</span>
					</div>
				))}
			</div>
		</div>
	)
}
