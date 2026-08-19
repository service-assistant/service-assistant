import { CodeHighlight } from '@mantine/code-highlight'
import { Badge, Button, Collapse, Group, Loader, Stack, Table, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useState } from 'react'
import { useJobs } from '@/hooks/useJobs'
import type { JobRead } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
	doing: 'blue',
	todo: 'gray',
	failed: 'red',
	aborted: 'orange',
	cancelled: 'yellow',
	succeeded: 'green',
}

function JobArgs({ job }: { job: JobRead }) {
	const [opened, { toggle }] = useDisclosure(false)
	const hasArgs = job.args && Object.keys(job.args).length > 0

	if (!hasArgs) return <Text c='dimmed'>—</Text>

	return (
		<>
			<Button size='compact-xs' variant='subtle' onClick={toggle}>
				{opened ? 'Ukryj' : 'Pokaż'}
			</Button>
			<Collapse expanded={opened}>
				<CodeHighlight code={JSON.stringify(job.args, null, 2)} language='json' mt={4} />
			</Collapse>
		</>
	)
}

export function JobsPage() {
	const [page, setPage] = useState(1)
	const { data, isLoading } = useJobs(page)

	return (
		<Stack gap='md'>
			<Title order={2}>Zadania w tle</Title>

			{isLoading ? (
				<Loader />
			) : (
				<Table highlightOnHover verticalSpacing='xs'>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>ID</Table.Th>
							<Table.Th>Kolejka</Table.Th>
							<Table.Th>Zadanie</Table.Th>
							<Table.Th>Status</Table.Th>
							<Table.Th>Próby</Table.Th>
							<Table.Th>Zaplanowano</Table.Th>
							<Table.Th>Przerwanie</Table.Th>
							<Table.Th>Argumenty</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{(data?.items ?? []).map((job) => (
							<Table.Tr key={job.id}>
								<Table.Td>{job.id}</Table.Td>
								<Table.Td>{job.queue_name}</Table.Td>
								<Table.Td>{job.task_name}</Table.Td>
								<Table.Td>
									<Badge color={STATUS_COLORS[job.status] ?? 'gray'}>
										{job.status}
									</Badge>
								</Table.Td>
								<Table.Td>{job.attempts}</Table.Td>
								<Table.Td>
									{job.scheduled_at
										? new Date(job.scheduled_at).toLocaleString('pl-PL')
										: '—'}
								</Table.Td>
								<Table.Td>
									{job.abort_requested ? <Badge color='red'>tak</Badge> : '—'}
								</Table.Td>
								<Table.Td>
									<JobArgs job={job} />
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			)}

			{!isLoading && (data?.items ?? []).length === 0 && <Text c='dimmed'>Brak zadań.</Text>}

			<Group justify='center'>
				<Button
					variant='default'
					disabled={page <= 1}
					onClick={() => setPage((p) => p - 1)}>
					Poprzednia
				</Button>
				<Text size='sm'>
					Strona {data?.page ?? page} z {data?.total_pages ?? '—'} ({data?.total ?? 0}{' '}
					razem)
				</Text>
				<Button
					variant='default'
					disabled={data !== undefined && page >= data.total_pages}
					onClick={() => setPage((p) => p + 1)}>
					Następna
				</Button>
			</Group>
		</Stack>
	)
}
