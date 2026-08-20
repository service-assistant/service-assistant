import { useAuth } from '@/auth/use-auth'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

export function LoginPage() {
	const { authenticated, login } = useAuth()
	const navigate = useNavigate()
	const [organizationSlug, setOrganizationSlug] = useState('')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	useEffect(() => {
		if (authenticated) void navigate({ to: '/' })
	}, [authenticated, navigate])

	async function handleSubmit(e: FormEvent) {
		e.preventDefault()
		setPending(true)
		setError(null)
		try {
			await login(organizationSlug, username, password)
			void navigate({ to: '/' })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Błąd logowania.')
		} finally {
			setPending(false)
		}
	}

	return (
		<div className='flex min-h-screen items-center justify-center'>
			<form
				onSubmit={handleSubmit}
				className='w-full max-w-sm rounded-lg border border-line bg-panel p-8'>
				<h1 className='mb-1 text-xl font-semibold text-cream'>Asystent Serwisanta</h1>
				<p className='mb-6 text-sm text-cream/60'>
					Zaloguj się, aby zarządzać bazą wiedzy.
				</p>
				<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
					Organizacja
				</label>
				<input
					autoFocus
					type='text'
					value={organizationSlug}
					onChange={(e) => setOrganizationSlug(e.target.value)}
					className='mb-4 w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
				/>
				<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
					Login
				</label>
				<input
					type='text'
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					className='mb-4 w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
				/>
				<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
					Hasło
				</label>
				<input
					type='password'
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className='mb-4 w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
				/>
				{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}
				<button
					type='submit'
					disabled={pending || !organizationSlug || !username || !password}
					className='w-full rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40'>
					{pending ? 'Logowanie…' : 'Zaloguj'}
				</button>
			</form>
		</div>
	)
}
