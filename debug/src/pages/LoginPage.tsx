import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'

export function LoginPage() {
	const { authenticated, login } = useAuth()
	const navigate = useNavigate()
	const [token, setToken] = useState('')
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
			await login(token)
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
							Zaloguj się tokenem dostępu, aby zobaczyć narzędzia deweloperskie.
						</Text>
					</div>
					<PasswordInput
						autoFocus
						label='Token dostępu'
						value={token}
						onChange={(e) => setToken(e.currentTarget.value)}
					/>
					{error && (
						<Alert color='red' variant='light'>
							{error}
						</Alert>
					)}
					<Button type='submit' loading={pending} disabled={!token} fullWidth>
						Zaloguj
					</Button>
				</Stack>
			</Paper>
		</Center>
	)
}
