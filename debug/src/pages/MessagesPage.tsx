import {
	Badge,
	Button,
	Center,
	Group,
	Loader,
	Modal,
	Paper,
	Select,
	Stack,
	Table,
	Text,
	TextInput,
	Title,
} from '@mantine/core'
import { IconMessageCircle, IconPlus, IconSearch } from '@tabler/icons-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useDeferredValue, useMemo, useState } from 'react'
import { useCreateMessageThread, useMessageDevices, useMessageThreads } from '@/hooks/useMessages'

function formatDate(value: string | null): string {
	if (!value) return '—'
	return new Date(value).toLocaleString('pl-PL')
}

export function MessagesPage() {
	const navigate = useNavigate()
	const [search, setSearch] = useState('')
	const deferredSearch = useDeferredValue(search)
	const [newThreadOpened, setNewThreadOpened] = useState(false)
	const [deviceId, setDeviceId] = useState<string | null>(null)
	const [title, setTitle] = useState('')
	const { data, isLoading, isFetching } = useMessageThreads(deferredSearch)
	const { data: devices, isLoading: devicesLoading } = useMessageDevices()
	const createThread = useCreateMessageThread()

	const deviceOptions = useMemo(
		() =>
			(devices ?? []).map((device) => ({
				value: String(device.id),
				label: `${device.organization_name} — ${device.name}${
					device.model_serial_code ? ` (${device.model_serial_code})` : ''
				}`,
			})),
		[devices],
	)

	function createNewThread() {
		if (!deviceId || !title.trim()) return
		createThread.mutate(
			{ device_id: Number(deviceId), title: title.trim() },
			{
				onSuccess: (thread) => {
					setNewThreadOpened(false)
					setDeviceId(null)
					setTitle('')
					void navigate({
						to: '/messages/$threadId',
						params: { threadId: String(thread.id) },
					})
				},
			},
		)
	}

	return (
		<Stack gap='lg'>
			<Group justify='space-between' align='flex-end'>
				<div>
					<Title order={2}>Messages</Title>
					<Text c='dimmed' size='sm'>
						Historia rozmów ze wszystkich organizacji, od najnowszych threadów.
					</Text>
				</div>
				<Button
					leftSection={<IconPlus size={17} />}
					onClick={() => setNewThreadOpened(true)}>
					Nowy thread
				</Button>
			</Group>

			<TextInput
				value={search}
				onChange={(event) => setSearch(event.currentTarget.value)}
				placeholder='Szukaj po tytule, urządzeniu lub organizacji…'
				leftSection={<IconSearch size={17} />}
				rightSection={isFetching && !isLoading ? <Loader size={16} /> : undefined}
			/>

			<Paper withBorder radius='md' style={{ overflow: 'hidden' }}>
				{isLoading ? (
					<Center py='xl'>
						<Loader />
					</Center>
				) : (
					<Table highlightOnHover verticalSpacing='sm'>
						<Table.Thead>
							<Table.Tr>
								<Table.Th>Thread</Table.Th>
								<Table.Th>Urządzenie</Table.Th>
								<Table.Th>Organizacja</Table.Th>
								<Table.Th>Wiadomości</Table.Th>
								<Table.Th>Utworzono</Table.Th>
								<Table.Th>Ostatnia wiadomość</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{(data ?? []).map((thread) => (
								<Table.Tr key={thread.id}>
									<Table.Td>
										<Link
											to='/messages/$threadId'
											params={{ threadId: String(thread.id) }}
											style={{ color: 'inherit', textDecoration: 'none' }}>
											<Group gap='xs' wrap='nowrap'>
												<IconMessageCircle size={18} />
												<div>
													<Text fw={600} lineClamp={1}>
														{thread.title}
													</Text>
													<Text size='xs' c='dimmed'>
														#{thread.id}
													</Text>
												</div>
											</Group>
										</Link>
									</Table.Td>
									<Table.Td>{thread.device_name}</Table.Td>
									<Table.Td>
										<Text size='sm'>{thread.organization_name}</Text>
										<Text size='xs' c='dimmed'>
											{thread.organization_slug}
										</Text>
									</Table.Td>
									<Table.Td>
										<Badge variant='light'>{thread.message_count}</Badge>
									</Table.Td>
									<Table.Td>{formatDate(thread.created_at)}</Table.Td>
									<Table.Td>{formatDate(thread.last_message_at)}</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				)}
				{!isLoading && (data ?? []).length === 0 && (
					<Text c='dimmed' ta='center' py='xl'>
						Nie znaleziono threadów.
					</Text>
				)}
			</Paper>

			<Modal
				opened={newThreadOpened}
				onClose={() => setNewThreadOpened(false)}
				title='Nowy thread'
				centered>
				<Stack>
					<Select
						label='Urządzenie'
						placeholder='Wybierz urządzenie'
						data={deviceOptions}
						value={deviceId}
						onChange={setDeviceId}
						searchable
						disabled={devicesLoading}
					/>
					<TextInput
						label='Tytuł'
						placeholder='Np. Błąd podnoszenia masztu'
						value={title}
						onChange={(event) => setTitle(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') createNewThread()
						}}
					/>
					{createThread.isError && (
						<Text c='red' size='sm'>
							Nie udało się utworzyć threada.
						</Text>
					)}
					<Group justify='flex-end'>
						<Button variant='default' onClick={() => setNewThreadOpened(false)}>
							Anuluj
						</Button>
						<Button
							loading={createThread.isPending}
							disabled={!deviceId || !title.trim()}
							onClick={createNewThread}>
							Utwórz
						</Button>
					</Group>
				</Stack>
			</Modal>
		</Stack>
	)
}
