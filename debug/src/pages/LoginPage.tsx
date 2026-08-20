import {
	Alert,
	Button,
	Center,
	Paper,
	PasswordInput,
	Stack,
	Text,
	TextInput,
	Title,
} from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'

export function LoginPage() {
	const { authenticated, login } = useAuth()
	const navigate = useNavigate()
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
			await login(username, password)
			void navigate({ to: '/' })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Błąd logowania.')
		} finally {
			setPending(false)
		}
	}

	return (
		<Center mih='100vh'>
			<Paper component='form' onSubmit={handleSubmit} withBorder shadow='md' p='xl' w={360}>
				<Stack gap='md'>
					<div>
						<Title order={3}>Asystent Serwisanta — Debug</Title>
						<Text c='dimmed' size='sm'>
							Zaloguj się jako administrator aplikacji, aby zobaczyć narzędzia
							deweloperskie.
						</Text>
					</div>
					<TextInput
						autoFocus
						label='Login'
						value={username}
						onChange={(e) => setUsername(e.currentTarget.value)}
					/>
					<PasswordInput
						label='Hasło'
						value={password}
						onChange={(e) => setPassword(e.currentTarget.value)}
					/>
					{error && (
						<Alert color='red' variant='light'>
							{error}
						</Alert>
					)}
					<Button
						type='submit'
						loading={pending}
						disabled={!username || !password}
						fullWidth>
						Zaloguj
					</Button>
				</Stack>
			</Paper>
		</Center>
	)
}
