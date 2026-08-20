import { ConfirmModal } from '@/components/ConfirmModal'
import { useDeleteUser, useUsers } from '@/hooks/useUsers'
import type { User } from '@/lib/types'
import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

const ORG_ROLE_LABELS: Record<string, string> = {
	admin: 'Administrator organizacji',
	member: 'Członek organizacji',
}

export function UsersPage() {
	const { data: users, isLoading } = useUsers()
	const deleteUser = useDeleteUser()

	const [pendingDelete, setPendingDelete] = useState<User | null>(null)
	const [error, setError] = useState<string | null>(null)

	async function handleDelete() {
		if (!pendingDelete) return
		try {
			await deleteUser.mutateAsync(pendingDelete.id)
			setPendingDelete(null)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się usunąć użytkownika.')
			setPendingDelete(null)
		}
	}

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
			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_2fr_auto] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Login</span>
					<span>Rola</span>
					<span />
				</div>
				{isLoading && <div className='px-4 py-3 text-sm text-cream/50'>Ładowanie…</div>}
				{!isLoading && (users ?? []).length === 0 && (
					<div className='px-4 py-3 text-sm text-cream/50'>Brak użytkowników.</div>
				)}
				{(users ?? []).map((user) => (
					<div
						key={user.id}
						className='grid grid-cols-[2fr_2fr_auto] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0'>
						<span className='text-cream'>{user.username}</span>
						<span>{ORG_ROLE_LABELS[user.org_role] ?? user.org_role}</span>
						<button
							type='button'
							onClick={() => setPendingDelete(user)}
							aria-label='Usuń użytkownika'
							className='cursor-pointer rounded p-1.5 text-cream/40 hover:text-red-400'>
							<Trash2 size={16} />
						</button>
					</div>
				))}
			</div>

			{pendingDelete && (
				<ConfirmModal
					title='Usuń użytkownika'
					description={`Użytkownik „${pendingDelete.username}” zostanie trwale usunięty.`}
					confirmLabel='Usuń'
					pendingLabel='Usuwanie…'
					pending={deleteUser.isPending}
					onConfirm={() => void handleDelete()}
					onClose={() => setPendingDelete(null)}
				/>
			)}
		</div>
	)
}
