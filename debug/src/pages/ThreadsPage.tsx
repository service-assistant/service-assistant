import { Loader, Stack, Table, Text, Title } from '@mantine/core'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useDevices } from '@/hooks/useDevices'
import { useThreads } from '@/hooks/useThreads'

export function ThreadsPage() {
	const { data: threads, isLoading } = useThreads()
	const { data: devices } = useDevices()
	const navigate = useNavigate()

	const deviceNameById = useMemo(() => {
		const map = new Map<number, string>()
		for (const d of devices ?? []) map.set(d.id, d.name)
		return map
	}, [devices])

	return (
		<Stack gap='md'>
			<Title order={2}>Wątki</Title>

			{isLoading ? (
				<Loader />
			) : (
				<Table highlightOnHover>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>ID</Table.Th>
							<Table.Th>Tytuł</Table.Th>
							<Table.Th>Urządzenie</Table.Th>
							<Table.Th>Utworzono</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{(threads ?? []).map((thread) => (
							<Table.Tr
								key={thread.id}
								onClick={() =>
									void navigate({
										to: '/threads/$threadId',
										params: { threadId: String(thread.id) },
									})
								}
								style={{ cursor: 'pointer' }}>
								<Table.Td>{thread.id}</Table.Td>
								<Table.Td>{thread.title}</Table.Td>
								<Table.Td>
									{deviceNameById.get(thread.device_id) ?? thread.device_id}
								</Table.Td>
								<Table.Td>
									{new Date(thread.created_at).toLocaleString('pl-PL')}
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			)}

			{!isLoading && (threads ?? []).length === 0 && <Text c='dimmed'>Brak wątków.</Text>}
		</Stack>
	)
}
