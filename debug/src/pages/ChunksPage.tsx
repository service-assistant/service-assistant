import {
	ActionIcon,
	Alert,
	Badge,
	Button,
	Collapse,
	Group,
	Image,
	Loader,
	Select,
	SimpleGrid,
	Stack,
	Table,
	Text,
	Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconChevronDown, IconChevronRight, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useAttachments } from '@/hooks/useAttachments'
import { useChunks, useDeleteChunk } from '@/hooks/useChunks'
import { buildChunkImageUrl } from '@/lib/images'
import type { ChunkRead } from '@/lib/types'

function ChunkRow({
	chunk,
	filename,
	expanded,
	onToggle,
}: {
	chunk: ChunkRead
	filename: string
	expanded: boolean
	onToggle: () => void
}) {
	const deleteChunk = useDeleteChunk()
	const images = chunk.metadata?.images ?? []

	function handleDelete() {
		modals.openConfirmModal({
			title: 'Usunąć chunk?',
			children: <Text size='sm'>Chunk #{chunk.id} zostanie trwale usunięty.</Text>,
			labels: { confirm: 'Usuń', cancel: 'Anuluj' },
			confirmProps: { color: 'red' },
			onConfirm: () => deleteChunk.mutate(chunk.id),
		})
	}

	return (
		<>
			<Table.Tr style={{ cursor: 'pointer' }} onClick={onToggle}>
				<Table.Td>
					{expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
				</Table.Td>
				<Table.Td>{chunk.id}</Table.Td>
				<Table.Td>{filename}</Table.Td>
				<Table.Td>{chunk.metadata?.page ?? '—'}</Table.Td>
				<Table.Td>
					<Text lineClamp={1} size='sm'>
						{chunk.content}
					</Text>
				</Table.Td>
				<Table.Td>
					{images.length > 0 ? <Badge color='blue'>{images.length}</Badge> : '—'}
				</Table.Td>
				<Table.Td onClick={(e) => e.stopPropagation()}>
					<ActionIcon
						color='red'
						variant='subtle'
						loading={deleteChunk.isPending}
						onClick={handleDelete}>
						<IconTrash size={16} />
					</ActionIcon>
				</Table.Td>
			</Table.Tr>
			<Table.Tr>
				<Table.Td colSpan={7} p={0}>
					<Collapse expanded={expanded}>
						<Stack p='md' gap='sm' bg='var(--mantine-color-default)'>
							<Text style={{ whiteSpace: 'pre-wrap' }} size='sm'>
								{chunk.content}
							</Text>
							{images.length > 0 && (
								<SimpleGrid cols={{ base: 2, sm: 4 }}>
									{images.map((path) => (
										<Image
											key={path}
											src={buildChunkImageUrl(path)}
											radius='sm'
										/>
									))}
								</SimpleGrid>
							)}
						</Stack>
					</Collapse>
				</Table.Td>
			</Table.Tr>
		</>
	)
}

export function ChunksPage() {
	const [attachmentId, setAttachmentId] = useState<number | null>(null)
	const [page, setPage] = useState(1)
	const [expandedId, setExpandedId] = useState<number | null>(null)

	const { data: attachments } = useAttachments()
	const { data: chunks, isLoading, isError, error } = useChunks(attachmentId, page)

	const attachmentOptions = useMemo(
		() => (attachments ?? []).map((a) => ({ value: String(a.id), label: a.original_filename })),
		[attachments],
	)
	const filenameById = useMemo(() => {
		const map = new Map<number, string>()
		for (const a of attachments ?? []) map.set(a.id, a.original_filename)
		return map
	}, [attachments])

	return (
		<Stack gap='md'>
			<Title order={2}>Chunki</Title>
			<Group>
				<Select
					placeholder='Wszystkie dokumenty'
					data={attachmentOptions}
					value={attachmentId !== null ? String(attachmentId) : null}
					onChange={(value) => {
						setAttachmentId(value ? Number(value) : null)
						setPage(1)
					}}
					clearable
					searchable
					w={320}
				/>
			</Group>

			{isError && (
				<Alert color='red'>{error instanceof Error ? error.message : 'Błąd'}</Alert>
			)}

			{isLoading ? (
				<Loader />
			) : (
				<Table highlightOnHover>
					<Table.Thead>
						<Table.Tr>
							<Table.Th />
							<Table.Th>ID</Table.Th>
							<Table.Th>Dokument</Table.Th>
							<Table.Th>Strona</Table.Th>
							<Table.Th>Treść</Table.Th>
							<Table.Th>Obrazy</Table.Th>
							<Table.Th />
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{(chunks ?? []).map((chunk) => (
							<ChunkRow
								key={chunk.id}
								chunk={chunk}
								filename={
									filenameById.get(chunk.attachment_id) ??
									`#${chunk.attachment_id}`
								}
								expanded={expandedId === chunk.id}
								onToggle={() =>
									setExpandedId((cur) => (cur === chunk.id ? null : chunk.id))
								}
							/>
						))}
					</Table.Tbody>
				</Table>
			)}

			{!isLoading && (chunks ?? []).length === 0 && (
				<Text c='dimmed'>Brak chunków dla wybranego filtra.</Text>
			)}

			<Group justify='center'>
				<Button
					variant='default'
					disabled={page <= 1}
					onClick={() => setPage((p) => p - 1)}>
					Poprzednia
				</Button>
				<Text size='sm'>Strona {page}</Text>
				<Button
					variant='default'
					disabled={(chunks ?? []).length < 20}
					onClick={() => setPage((p) => p + 1)}>
					Następna
				</Button>
			</Group>
		</Stack>
	)
}
