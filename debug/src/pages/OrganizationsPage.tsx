import {
	Alert,
	Button,
	Group,
	Loader,
	Modal,
	PasswordInput,
	Stack,
	Table,
	Text,
	TextInput,
	Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { type FormEvent, useState } from 'react'
import { useCreateOrganization, useOrganizations } from '@/hooks/useOrganizations'
import { ApiError } from '@/lib/api'

function CreateOrganizationModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
	const createOrganization = useCreateOrganization()
	const [name, setName] = useState('')
	const [slug, setSlug] = useState('')
	const [adminUsername, setAdminUsername] = useState('')
	const [adminPassword, setAdminPassword] = useState('')
	const [error, setError] = useState<string | null>(null)

	function reset() {
		setName('')
		setSlug('')
		setAdminUsername('')
		setAdminPassword('')
		setError(null)
	}

	async function handleSubmit(e: FormEvent) {
		e.preventDefault()
		setError(null)
		try {
			await createOrganization.mutateAsync({
				name,
				slug,
				admin_username: adminUsername,
				admin_password: adminPassword,
			})
			reset()
			onClose()
		} catch (err) {
			setError(err instanceof ApiError ? err.message : 'Nie udało się utworzyć organizacji.')
		}
	}

	return (
		<Modal
			opened={opened}
			onClose={() => {
				reset()
				onClose()
			}}
			title='Nowa organizacja'>
			<form onSubmit={handleSubmit}>
				<Stack gap='md'>
					<TextInput
						autoFocus
						label='Nazwa organizacji'
						placeholder='Acme Forklifts'
						value={name}
						onChange={(e) => setName(e.currentTarget.value)}
						required
					/>
					<TextInput
						label='Slug (identyfikator logowania)'
						placeholder='acme'
						value={slug}
						onChange={(e) => setSlug(e.currentTarget.value)}
						required
					/>
					<TextInput
						label='Login pierwszego użytkownika'
						value={adminUsername}
						onChange={(e) => setAdminUsername(e.currentTarget.value)}
						required
					/>
					<PasswordInput
						label='Hasło pierwszego użytkownika'
						value={adminPassword}
						onChange={(e) => setAdminPassword(e.currentTarget.value)}
						required
						minLength={8}
					/>
					{error && (
						<Alert color='red' variant='light'>
							{error}
						</Alert>
					)}
					<Group justify='flex-end'>
						<Button variant='default' onClick={onClose} type='button'>
							Anuluj
						</Button>
						<Button type='submit' loading={createOrganization.isPending}>
							Utwórz
						</Button>
					</Group>
				</Stack>
			</form>
		</Modal>
	)
}

export function OrganizationsPage() {
	const { data, isLoading } = useOrganizations()
	const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false)

	return (
		<Stack gap='md'>
			<Group justify='space-between'>
				<Title order={2}>Organizacje</Title>
				<Button onClick={openModal}>Nowa organizacja</Button>
			</Group>

			{isLoading ? (
				<Loader />
			) : (
				<Table highlightOnHover verticalSpacing='xs'>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>ID</Table.Th>
							<Table.Th>Nazwa</Table.Th>
							<Table.Th>Slug</Table.Th>
							<Table.Th>Utworzono</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{(data ?? []).map((organization) => (
							<Table.Tr key={organization.id}>
								<Table.Td>{organization.id}</Table.Td>
								<Table.Td>{organization.name}</Table.Td>
								<Table.Td>{organization.slug}</Table.Td>
								<Table.Td>
									{new Date(organization.created_at).toLocaleString('pl-PL')}
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			)}

			{!isLoading && (data ?? []).length === 0 && <Text c='dimmed'>Brak organizacji.</Text>}

			<CreateOrganizationModal opened={modalOpened} onClose={closeModal} />
		</Stack>
	)
}
