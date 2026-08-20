import {
	ActionIcon,
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
import { IconPencil, IconTrash } from '@tabler/icons-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useAuth } from '@/auth/use-auth'
import {
	useCreateOrganization,
	useDeleteOrganization,
	useOrganizations,
	useUpdateOrganization,
} from '@/hooks/useOrganizations'
import { ApiError } from '@/lib/api'
import type { OrganizationRead } from '@/lib/types'

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

function EditOrganizationModal({
	organization,
	opened,
	onClose,
}: {
	organization: OrganizationRead | null
	opened: boolean
	onClose: () => void
}) {
	const updateOrganization = useUpdateOrganization()
	const [name, setName] = useState('')
	const [slug, setSlug] = useState('')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (organization) {
			setName(organization.name)
			setSlug(organization.slug)
			setError(null)
		}
	}, [organization])

	function reset() {
		setName('')
		setSlug('')
		setError(null)
	}

	async function handleSubmit(e: FormEvent) {
		e.preventDefault()
		if (!organization) return
		setError(null)
		try {
			await updateOrganization.mutateAsync({ id: organization.id, body: { name, slug } })
			reset()
			onClose()
		} catch (err) {
			setError(
				err instanceof ApiError ? err.message : 'Nie udało się zaktualizować organizacji.',
			)
		}
	}

	return (
		<Modal
			opened={opened}
			onClose={() => {
				reset()
				onClose()
			}}
			title='Edytuj organizację'>
			<form onSubmit={handleSubmit}>
				<Stack gap='md'>
					<TextInput
						autoFocus
						label='Nazwa organizacji'
						value={name}
						onChange={(e) => setName(e.currentTarget.value)}
						required
					/>
					<TextInput
						label='Slug (identyfikator logowania)'
						value={slug}
						onChange={(e) => setSlug(e.currentTarget.value)}
						required
					/>
					{error && (
						<Alert color='red' variant='light'>
							{error}
						</Alert>
					)}
					<Group justify='flex-end'>
						<Button
							variant='default'
							onClick={() => {
								reset()
								onClose()
							}}
							type='button'>
							Anuluj
						</Button>
						<Button type='submit' loading={updateOrganization.isPending}>
							Zapisz
						</Button>
					</Group>
				</Stack>
			</form>
		</Modal>
	)
}

function DeleteOrganizationModal({
	organization,
	opened,
	onClose,
}: {
	organization: OrganizationRead | null
	opened: boolean
	onClose: () => void
}) {
	const deleteOrganization = useDeleteOrganization()
	const [confirmSlug, setConfirmSlug] = useState('')
	const [error, setError] = useState<string | null>(null)

	function reset() {
		setConfirmSlug('')
		setError(null)
	}

	async function handleConfirm() {
		if (!organization) return
		setError(null)
		try {
			await deleteOrganization.mutateAsync(organization.id)
			reset()
			onClose()
		} catch (err) {
			setError(err instanceof ApiError ? err.message : 'Nie udało się usunąć organizacji.')
		}
	}

	return (
		<Modal
			opened={opened}
			onClose={() => {
				reset()
				onClose()
			}}
			title='Usuń organizację'>
			{organization && (
				<Stack gap='md'>
					<Text size='sm'>
						Spowoduje to trwałe usunięcie organizacji{' '}
						<strong>{organization.name}</strong> wraz ze wszystkimi jej użytkownikami,
						kategoriami, urządzeniami i załącznikami.
					</Text>
					<Text size='sm'>
						Wpisz slug organizacji <strong>{organization.slug}</strong>, aby
						potwierdzić.
					</Text>
					<TextInput
						autoFocus
						value={confirmSlug}
						onChange={(e) => setConfirmSlug(e.currentTarget.value)}
						placeholder={organization.slug}
					/>
					{error && (
						<Alert color='red' variant='light'>
							{error}
						</Alert>
					)}
					<Group justify='flex-end'>
						<Button
							variant='default'
							onClick={() => {
								reset()
								onClose()
							}}>
							Anuluj
						</Button>
						<Button
							color='red'
							disabled={confirmSlug !== organization.slug}
							loading={deleteOrganization.isPending}
							onClick={handleConfirm}>
							Usuń
						</Button>
					</Group>
				</Stack>
			)}
		</Modal>
	)
}

export function OrganizationsPage() {
	const { user } = useAuth()
	const { data, isLoading } = useOrganizations()
	const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false)
	const [organizationToEdit, setOrganizationToEdit] = useState<OrganizationRead | null>(null)
	const [organizationToDelete, setOrganizationToDelete] = useState<OrganizationRead | null>(null)

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
							<Table.Th />
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
								<Table.Td>
									<Group gap='xs'>
										<ActionIcon
											variant='subtle'
											aria-label='Edytuj organizację'
											onClick={() => setOrganizationToEdit(organization)}>
											<IconPencil size={16} />
										</ActionIcon>
										{organization.id === user?.organizationId ? (
											<Text size='xs' c='dimmed'>
												Bieżąca organizacja
											</Text>
										) : (
											<ActionIcon
												variant='subtle'
												color='red'
												aria-label='Usuń organizację'
												onClick={() =>
													setOrganizationToDelete(organization)
												}>
												<IconTrash size={16} />
											</ActionIcon>
										)}
									</Group>
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			)}

			{!isLoading && (data ?? []).length === 0 && <Text c='dimmed'>Brak organizacji.</Text>}

			<CreateOrganizationModal opened={modalOpened} onClose={closeModal} />
			<EditOrganizationModal
				organization={organizationToEdit}
				opened={organizationToEdit !== null}
				onClose={() => setOrganizationToEdit(null)}
			/>
			<DeleteOrganizationModal
				organization={organizationToDelete}
				opened={organizationToDelete !== null}
				onClose={() => setOrganizationToDelete(null)}
			/>
		</Stack>
	)
}
