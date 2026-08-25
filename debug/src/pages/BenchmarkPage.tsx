import { CodeHighlight } from '@mantine/code-highlight'
import { Alert, Badge, Button, Card, Group, List, Loader, Stack, Text, Title } from '@mantine/core'
import { modals } from '@mantine/modals'
import { useState } from 'react'
import {
	useBenchmarkCases,
	useCancelCaseRun,
	useCaseRun,
	useDocumentStatus,
	useDownloadDocuments,
	useSetupRun,
	useStartCaseRun,
	useStartSetupRun,
} from '@/hooks/useBenchmark'
import type { BenchmarkCase, BenchmarkSetupStep } from '@/lib/types'

const RUN_STATE_COLORS: Record<string, string> = {
	queued: 'gray',
	processing: 'blue',
	completed: 'green',
	failed: 'red',
	cancelled: 'yellow',
}

function SetupSection() {
	const { data: setup, error: setupQueryError, isLoading } = useSetupRun()
	const startSetup = useStartSetupRun()
	const isActive = setup?.state === 'queued' || setup?.state === 'processing'

	return (
		<Card withBorder>
			<Group justify='space-between' mb='sm'>
				<Title order={4}>Setup benchmarku</Title>
				<Button
					size='xs'
					loading={startSetup.isPending}
					disabled={isActive}
					onClick={() => startSetup.mutate()}>
					Uruchom setup
				</Button>
			</Group>

			{isLoading && <Loader size='sm' />}
			{setupQueryError && <Alert color='red'>{setupQueryError.message}</Alert>}
			{startSetup.error && <Alert color='red'>{startSetup.error.message}</Alert>}

			{setup ? (
				<Stack gap='xs'>
					<Group gap='xs'>
						<Badge color={RUN_STATE_COLORS[setup.state] ?? 'gray'}>{setup.state}</Badge>
						{setup.error && <Text c='red'>{setup.error}</Text>}
					</Group>
					<List spacing={4} size='sm'>
						{(setup.steps ?? []).map((step: BenchmarkSetupStep) => (
							<List.Item key={step.key}>
								<Group gap='xs'>
									<Text fw={500}>{step.label}</Text>
									<Badge size='xs' color={RUN_STATE_COLORS[step.state] ?? 'gray'}>
										{step.state}
									</Badge>
								</Group>
								<Text size='xs' c='dimmed'>
									{step.message}
								</Text>
								{step.details && (
									<CodeHighlight
										code={JSON.stringify(step.details, null, 2)}
										language='json'
										mt={4}
									/>
								)}
							</List.Item>
						))}
					</List>
				</Stack>
			) : (
				!isLoading && (
					<Text c='dimmed' size='sm'>
						Setup nie był jeszcze uruchamiany.
					</Text>
				)
			)}
		</Card>
	)
}

function DocumentsSection() {
	const { data: status, error: statusError, isLoading } = useDocumentStatus()
	const download = useDownloadDocuments()

	return (
		<Card withBorder>
			<Group justify='space-between' mb='sm'>
				<Title order={4}>Dokumenty benchmarku</Title>
				<Button size='xs' loading={download.isPending} onClick={() => download.mutate()}>
					Pobierz brakujące
				</Button>
			</Group>

			{isLoading ? (
				<Loader size='sm' />
			) : statusError ? (
				<Alert color='red'>{statusError.message}</Alert>
			) : status ? (
				<Stack gap='xs'>
					{!status.configured && (
						<Alert color='orange'>
							Brakuje konfiguracji: {status.missing_configuration.join(', ')}
						</Alert>
					)}
					<Text size='sm'>
						Gotowe: {status.ready} / {status.total} · brakujące: {status.missing} ·
						nieaktualne: {status.outdated}
					</Text>
					{status.documents.some((document) => document.state !== 'ready') && (
						<>
							<Text size='sm' c='orange'>
								Pliki wymagające pobrania:
							</Text>
							<List size='sm'>
								{status.documents
									.filter((document) => document.state !== 'ready')
									.map((document) => (
										<List.Item key={document.key}>
											{document.filename} ({document.state})
										</List.Item>
									))}
							</List>
						</>
					)}
					{download.error && <Alert color='red'>{download.error.message}</Alert>}
				</Stack>
			) : (
				<Text c='dimmed' size='sm'>
					Brak danych o dokumentach.
				</Text>
			)}
		</Card>
	)
}

function CaseRunResult({ runId }: { runId: string }) {
	const { data: run } = useCaseRun(runId)
	const cancelRun = useCancelCaseRun()

	if (!run) return <Loader size='sm' />

	const result = run.result ?? {}
	const score = typeof result.score === 'number' ? result.score : undefined
	const passed = typeof result.passed === 'boolean' ? result.passed : undefined
	const answer = typeof result.answer === 'string' ? result.answer : undefined
	const isActive = run.state === 'queued' || run.state === 'processing'

	return (
		<Stack gap='xs' mt='sm'>
			<Group gap='xs'>
				<Badge color={RUN_STATE_COLORS[run.state] ?? 'gray'}>{run.state}</Badge>
				{score !== undefined && <Badge variant='light'>score: {score}</Badge>}
				{passed !== undefined && (
					<Badge color={passed ? 'green' : 'red'}>
						{passed ? 'zaliczone' : 'niezaliczone'}
					</Badge>
				)}
				{isActive && (
					<Button
						size='compact-xs'
						color='red'
						variant='light'
						loading={cancelRun.isPending}
						onClick={() => cancelRun.mutate(run.id)}>
						Anuluj
					</Button>
				)}
			</Group>
			{run.error && <Alert color='red'>{run.error}</Alert>}
			{answer && (
				<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
					{answer}
				</Text>
			)}
			<CodeHighlight code={JSON.stringify(run.result, null, 2)} language='json' />
		</Stack>
	)
}

function CaseItem({ testCase }: { testCase: BenchmarkCase }) {
	const [runId, setRunId] = useState<string | null>(null)
	const startRun = useStartCaseRun()

	function handleRun() {
		modals.openConfirmModal({
			title: 'Uruchomić przypadek testowy?',
			children: <Text size='sm'>„{testCase.title}”</Text>,
			labels: { confirm: 'Uruchom', cancel: 'Anuluj' },
			onConfirm: () => {
				startRun.mutate(testCase.id, {
					onSuccess: (run) => setRunId(run.id),
				})
			},
		})
	}

	return (
		<Card withBorder>
			<Group justify='space-between' align='flex-start'>
				<div>
					<Text fw={500}>{testCase.title}</Text>
					<Text size='xs' c='dimmed'>
						{testCase.category} · {testCase.expected_route}
					</Text>
					<Text size='sm' mt='xs'>
						{testCase.question}
					</Text>
				</div>
				<Button size='xs' loading={startRun.isPending} onClick={handleRun}>
					Uruchom
				</Button>
			</Group>
			{runId && <CaseRunResult runId={runId} />}
		</Card>
	)
}

function CasesSection() {
	const { data, isLoading } = useBenchmarkCases()

	return (
		<Stack gap='sm'>
			<Title order={4}>
				Przypadki testowe {data ? `(${data.cases.length}, v${data.version})` : ''}
			</Title>
			{isLoading ? (
				<Loader size='sm' />
			) : (
				(data?.cases ?? []).map((testCase) => (
					<CaseItem key={testCase.id} testCase={testCase} />
				))
			)}
		</Stack>
	)
}

export function BenchmarkPage() {
	return (
		<Stack gap='md'>
			<Title order={2}>Benchmark</Title>
			<Alert color='blue' variant='light'>
				Działa wyłącznie na danych organizacji „system" — nie na danych rzeczywistych
				klientów.
			</Alert>
			<SetupSection />
			<DocumentsSection />
			<CasesSection />
		</Stack>
	)
}
