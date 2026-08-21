import { useAuth } from '@/auth/use-auth'
import { ConfirmModal } from '@/components/ConfirmModal'
import { EditUserModal } from '@/components/EditUserModal'
import { useDeleteUser, useUsers } from '@/hooks/useUsers'
import type { User } from '@/lib/types'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

type SortColumn = 'username' | 'org_role' | 'created_at' | 'updated_at'
type SortOrder = 'asc' | 'desc'

const SORT_COLUMNS: { key: SortColumn; label: string }[] = [
	{ key: 'username', label: 'Login' },
	{ key: 'org_role', label: 'Rola' },
	{ key: 'created_at', label: 'Utworzono' },
	{ key: 'updated_at', label: 'Zaktualizowano' },
]

const ORG_ROLE_LABELS: Record<string, string> = {
	admin: 'Administrator organizacji',
	member: 'Członek organizacji',
}

const ORG_ROLE_BADGE_CLASSES: Record<string, string> = {
	admin: 'border border-ember/40 bg-ember/10 text-ember',
	member: 'border border-cream/20 bg-cream/5 text-cream/60',
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat('pl-PL', { numeric: 'auto' })

const RELATIVE_TIME_UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
	{ unit: 'year', seconds: 31536000 },
	{ unit: 'month', seconds: 2592000 },
	{ unit: 'day', seconds: 86400 },
	{ unit: 'hour', seconds: 3600 },
	{ unit: 'minute', seconds: 60 },
]

function formatDate(value: string) {
	const diffSeconds = (new Date(value).getTime() - Date.now()) / 1000

	for (const { unit, seconds } of RELATIVE_TIME_UNITS) {
		if (Math.abs(diffSeconds) >= seconds) {
			return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / seconds), unit)
		}
	}
	return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds), 'second')
}

export function UsersPage() {
	const { data: users, isLoading } = useUsers()
	const deleteUser = useDeleteUser()
	const { user: currentUser } = useAuth()
	const navigate = useNavigate()
	const { sort: sortParam, order: orderParam } = useSearch({ strict: false }) as {
		sort?: SortColumn
		order?: SortOrder
	}
	const sort = sortParam ?? 'username'
	const order = orderParam ?? 'asc'

	const [pendingDelete, setPendingDelete] = useState<User | null>(null)
	const [pendingEdit, setPendingEdit] = useState<User | null>(null)
	const [error, setError] = useState<string | null>(null)

	const sortedUsers = useMemo(() => {
		const list = [...(users ?? [])]
		list.sort((a, b) => {
			let comparison: number
			switch (sort) {
				case 'created_at':
					comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
					break
				case 'updated_at':
					comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
					break
				case 'org_role':
					comparison = a.org_role.localeCompare(b.org_role)
					break
				default:
					comparison = a.username.localeCompare(b.username)
			}
			return order === 'asc' ? comparison : -comparison
		})
		return list
	}, [users, sort, order])

	function handleSort(column: SortColumn) {
		void navigate({
			to: '/users',
			search: {
				sort: column,
				order: sort === column && order === 'asc' ? 'desc' : 'asc',
			},
		})
	}

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
				<div className='grid grid-cols-[repeat(5,minmax(0,1fr))] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					{SORT_COLUMNS.map(({ key, label }) => (
						<button
							key={key}
							type='button'
							onClick={() => handleSort(key)}
							className='flex cursor-pointer items-center gap-1 text-left uppercase tracking-wide text-cream/40 hover:text-cream/70'>
							{label}
							{sort === key &&
								(order === 'asc' ? (
									<ChevronUp size={12} />
								) : (
									<ChevronDown size={12} />
								))}
						</button>
					))}
					<span />
				</div>
				{isLoading && <div className='px-4 py-3 text-sm text-cream/50'>Ładowanie…</div>}
				{!isLoading && sortedUsers.length === 0 && (
					<div className='px-4 py-3 text-sm text-cream/50'>Brak użytkowników.</div>
				)}
				{sortedUsers.map((user) => (
					<div
						key={user.id}
						className='grid grid-cols-[repeat(5,minmax(0,1fr))] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0'>
						<span className='truncate text-cream'>
							{user.username}
							{currentUser?.id === user.id && (
								<span className='ml-2 text-cream/40'>(Ty)</span>
							)}
						</span>
						<span>
							<span
								className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-[5px] text-[11px] ${ORG_ROLE_BADGE_CLASSES[user.org_role] ?? ORG_ROLE_BADGE_CLASSES.member}`}>
								{ORG_ROLE_LABELS[user.org_role] ?? user.org_role}
							</span>
						</span>
						<span className='truncate'>{formatDate(user.created_at)}</span>
						<span className='truncate'>{formatDate(user.updated_at)}</span>
						<div className='flex items-center gap-1'>
							<button
								type='button'
								onClick={() => setPendingEdit(user)}
								aria-label='Edytuj użytkownika'
								className='cursor-pointer rounded p-1.5 text-cream/40 hover:text-cream'>
								<Pencil size={16} />
							</button>
							{currentUser?.id !== user.id && (
								<button
									type='button'
									onClick={() => setPendingDelete(user)}
									aria-label='Usuń użytkownika'
									className='cursor-pointer rounded p-1.5 text-cream/40 hover:text-red-400'>
									<Trash2 size={16} />
								</button>
							)}
						</div>
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

			{pendingEdit && (
				<EditUserModal user={pendingEdit} onClose={() => setPendingEdit(null)} />
			)}
		</div>
	)
}
