import { useUpdateUser } from '@/hooks/useUsers'
import type { User } from '@/lib/types'
import { useState } from 'react'

const ORG_ROLE_LABELS: Record<string, string> = {
	member: 'Członek organizacji',
	admin: 'Administrator organizacji',
}

export function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
	const updateUser = useUpdateUser(user.id)

	const [username, setUsername] = useState(user.username)
	const [password, setPassword] = useState('')
	const [orgRole, setOrgRole] = useState<'member' | 'admin'>(
		user.org_role === 'admin' ? 'admin' : 'member',
	)
	const [error, setError] = useState<string | null>(null)

	const trimmedUsername = username.trim()

	async function handleSubmit() {
		if (!trimmedUsername) {
			setError('Login jest wymagany.')
			return
		}
		if (password && password.length < 8) {
			setError('Hasło musi mieć co najmniej 8 znaków.')
			return
		}
		setError(null)

		const body: { username?: string; password?: string; org_role?: 'member' | 'admin' } = {}
		if (trimmedUsername !== user.username) body.username = trimmedUsername
		if (password) body.password = password
		if (orgRole !== user.org_role) body.org_role = orgRole

		try {
			await updateUser.mutateAsync(body)
			onClose()
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Nie udało się zaktualizować użytkownika.',
			)
		}
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
			<div className='w-full max-w-sm rounded-lg border border-line bg-panel p-6'>
				<h3 className='mb-4 text-lg font-semibold text-cream'>Edytuj użytkownika</h3>

				<div className='mb-4'>
					<label
						htmlFor='edit-user-username'
						className='mb-1 block text-sm text-cream/60'>
						Login
					</label>
					<input
						id='edit-user-username'
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						className='w-full rounded border border-line bg-transparent px-3 py-2 text-cream'
						autoFocus
					/>
				</div>

				<div className='mb-4'>
					<label
						htmlFor='edit-user-password'
						className='mb-1 block text-sm text-cream/60'>
						Nowe hasło (opcjonalnie)
					</label>
					<input
						id='edit-user-password'
						type='password'
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder='Pozostaw puste, aby nie zmieniać'
						className='w-full rounded border border-line bg-transparent px-3 py-2 text-cream placeholder:text-cream/30'
					/>
				</div>

				<div className='mb-4'>
					<label
						htmlFor='edit-user-org-role'
						className='mb-1 block text-sm text-cream/60'>
						Rola
					</label>
					<select
						id='edit-user-org-role'
						value={orgRole}
						onChange={(event) => setOrgRole(event.target.value as 'member' | 'admin')}
						className='w-full rounded border border-line bg-transparent px-3 py-2 text-cream'>
						{Object.entries(ORG_ROLE_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</div>

				{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}

				<div className='flex justify-end gap-2'>
					<button
						type='button'
						onClick={onClose}
						className='cursor-pointer rounded-md px-4 py-2 text-sm text-cream/70 hover:text-cream'>
						Anuluj
					</button>
					<button
						type='button'
						disabled={updateUser.isPending}
						onClick={() => void handleSubmit()}
						className='cursor-pointer rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40'>
						{updateUser.isPending ? 'Zapisywanie…' : 'Zapisz'}
					</button>
				</div>
			</div>
		</div>
	)
}
