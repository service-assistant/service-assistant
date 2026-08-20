import { useAuth } from '@/auth/use-auth'
import { useCreateUser } from '@/hooks/useUsers'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

const ORG_ROLE_LABELS: Record<string, string> = {
	member: 'Członek organizacji',
	admin: 'Administrator organizacji',
}

export function AddUserPage() {
	const navigate = useNavigate()
	const createUser = useCreateUser()
	const { user: currentUser } = useAuth()
	const isSystemAppAdmin =
		currentUser?.appRole === 'admin' && currentUser.organizationSlug === 'system'

	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [orgRole, setOrgRole] = useState<'member' | 'admin'>('member')
	const [error, setError] = useState<string | null>(null)

	const trimmedUsername = username.trim()

	async function handleSubmit() {
		if (!trimmedUsername) {
			setError('Login jest wymagany.')
			return
		}
		if (password.length < 8) {
			setError('Hasło musi mieć co najmniej 8 znaków.')
			return
		}
		setError(null)
		try {
			await createUser.mutateAsync({ username: trimmedUsername, password, org_role: orgRole })
			void navigate({ to: '/users' })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać użytkownika.')
		}
	}

	return (
		<div>
			<Link to='/users' className='mb-4 inline-block text-sm text-cream/60 hover:text-cream'>
				← Wróć do użytkowników
			</Link>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>Dodaj użytkownika</h1>

			<div className='max-w-md rounded-lg border border-line bg-panel p-4'>
				<div className='mb-4'>
					<label htmlFor='user-username' className='mb-1 block text-sm text-cream/60'>
						Login
					</label>
					<input
						id='user-username'
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						className='w-full rounded border border-line bg-transparent px-3 py-2 text-cream'
						autoFocus
					/>
				</div>

				<div className='mb-4'>
					<label htmlFor='user-password' className='mb-1 block text-sm text-cream/60'>
						Hasło
					</label>
					<input
						id='user-password'
						type='password'
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						className='w-full rounded border border-line bg-transparent px-3 py-2 text-cream'
					/>
				</div>

				<div className='mb-4'>
					<label htmlFor='user-org-role' className='mb-1 block text-sm text-cream/60'>
						Rola
					</label>
					<select
						id='user-org-role'
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

				{isSystemAppAdmin && (
					<p className='mb-4 text-sm text-cream/60'>
						Ten użytkownik zostanie automatycznie administratorem aplikacji (app_admin),
						ponieważ jest tworzony w organizacji systemowej.
					</p>
				)}

				{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}

				<div className='flex justify-end gap-3'>
					<Link to='/users' className='px-3 py-2 text-sm text-cream/60 hover:text-cream'>
						Anuluj
					</Link>
					<button
						type='button'
						onClick={() => void handleSubmit()}
						disabled={createUser.isPending}
						className='rounded bg-cream px-4 py-2 text-sm font-medium text-black disabled:opacity-50'>
						{createUser.isPending ? 'Dodawanie…' : 'Dodaj użytkownika'}
					</button>
				</div>
			</div>
		</div>
	)
}
