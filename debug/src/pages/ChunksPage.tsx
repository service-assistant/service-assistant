import {
	Badge,
	Center,
	Group,
	Loader,
	Paper,
	Stack,
	Table,
	Text,
	TextInput,
	Title,
} from '@mantine/core'
import { IconFileText, IconSearch } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useDeferredValue, useState } from 'react'
import { useChunkFiles } from '@/hooks/useChunks'

const STATUS_COLORS = {
	ready: 'gray',
	queued: 'blue',
	running: 'yellow',
	succeeded: 'green',
	failed: 'red',
} as const

export function ChunksPage() {
	const [search, setSearch] = useState('')
	const deferredSearch = useDeferredValue(search)
	const { data, isLoading, isFetching } = useChunkFiles(deferredSearch)

	return (
		<Stack gap='lg'>
			<div>
				<Title order={2}>Chunks</Title>
				<Text c='dimmed' size='sm'>
					Podejrzyj podział dokumentów na fragmenty i zweryfikuj metadane stron.
				</Text>
			</div>

			<TextInput
				value={search}
				onChange={(event) => setSearch(event.currentTarget.value)}
				placeholder='Szukaj po nazwie pliku lub organizacji…'
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
								<Table.Th>Plik</Table.Th>
								<Table.Th>Organizacja</Table.Th>
								<Table.Th>Status</Table.Th>
								<Table.Th>Strony</Table.Th>
								<Table.Th>Chunki</Table.Th>
								<Table.Th>Dodano</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{(data ?? []).map((file) => (
								<Table.Tr key={file.id}>
									<Table.Td>
										<Link
											to='/chunks/$attachmentId'
											params={{ attachmentId: String(file.id) }}
											style={{ color: 'inherit', textDecoration: 'none' }}>
											<Group gap='xs' wrap='nowrap'>
												<IconFileText size={18} />
												<Text fw={600} lineClamp={1}>
													{file.original_filename}
												</Text>
											</Group>
										</Link>
									</Table.Td>
									<Table.Td>
										<Text size='sm'>{file.organization_name}</Text>
										<Text size='xs' c='dimmed'>
											{file.organization_slug}
										</Text>
									</Table.Td>
									<Table.Td>
										<Badge color={STATUS_COLORS[file.ingest_status]}>
											{file.ingest_status}
										</Badge>
									</Table.Td>
									<Table.Td>{file.ingest_pages_total}</Table.Td>
									<Table.Td>{file.chunk_count}</Table.Td>
									<Table.Td>
										{new Date(file.created_at).toLocaleString('pl-PL')}
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				)}
				{!isLoading && (data ?? []).length === 0 && (
					<Text c='dimmed' ta='center' py='xl'>
						Nie znaleziono plików.
					</Text>
				)}
			</Paper>
		</Stack>
	)
}
