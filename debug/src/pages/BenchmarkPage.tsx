import { CodeHighlight } from '@mantine/code-highlight'
import {
	Accordion,
	Alert,
	Badge,
	Button,
	Card,
	Collapse,
	Group,
	List,
	Loader,
	Paper,
	SegmentedControl,
	SimpleGrid,
	Stack,
	Text,
	Title,
	UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { useState } from 'react'
import {
	useBenchmarkCases,
	useCancelCaseRun,
	useCaseRun,
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
	const [opened, { toggle }] = useDisclosure(false)
	const isActive = setup?.state === 'queued' || setup?.state === 'processing'

	return (
		<Card withBorder>
			<Group justify='space-between' wrap='nowrap'>
				<UnstyledButton
					onClick={toggle}
					aria-expanded={opened}
					aria-controls='benchmark-setup-details'
					style={{ flex: 1 }}>
					<Group gap='xs' wrap='nowrap'>
						<Title order={4}>Setup benchmarku</Title>
						{isLoading ? (
							<Loader size='xs' />
						) : (
							<Badge color={RUN_STATE_COLORS[setup?.state ?? ''] ?? 'gray'}>
								{setup?.state ?? 'nieuruchomiony'}
							</Badge>
						)}
						{opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
					</Group>
				</UnstyledButton>
				<Button
					size='xs'
					loading={startSetup.isPending}
					disabled={isActive}
					onClick={() => startSetup.mutate()}>
					Uruchom setup
				</Button>
			</Group>

			<Collapse expanded={opened} id='benchmark-setup-details'>
				<Stack gap='xs' mt='sm'>
					{setupQueryError && <Alert color='red'>{setupQueryError.message}</Alert>}
					{startSetup.error && <Alert color='red'>{startSetup.error.message}</Alert>}
					{setup?.error && <Alert color='red'>{setup.error}</Alert>}

					{setup ? (
						<List spacing={4} size='sm'>
							{(setup.steps ?? []).map((step: BenchmarkSetupStep) => (
								<List.Item key={step.key}>
									<Group gap='xs'>
										<Text fw={500}>{step.label}</Text>
										<Badge
											size='xs'
											color={RUN_STATE_COLORS[step.state] ?? 'gray'}>
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
					) : (
						!isLoading &&
						!setupQueryError && (
							<Text c='dimmed' size='sm'>
								Setup nie był jeszcze uruchamiany.
							</Text>
						)
					)}
				</Stack>
			</Collapse>
		</Card>
	)
}

type ResultRecord = Record<string, unknown>

function asRecord(value: unknown): ResultRecord | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as ResultRecord)
		: null
}

function asRecordArray(value: unknown): ResultRecord[] {
	return Array.isArray(value)
		? value.map(asRecord).filter((item): item is ResultRecord => item !== null)
		: []
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: []
}

function ChunkList({
	chunks,
	showEvaluation,
}: {
	chunks: ResultRecord[]
	showEvaluation: boolean
}) {
	if (chunks.length === 0) {
		return (
			<Text size='sm' c='dimmed'>
				Nie otrzymano żadnych chunków.
			</Text>
		)
	}

	return (
		<Accordion variant='separated' multiple>
			{chunks.map((chunk, index) => {
				const metadata = asRecord(chunk.metadata)
				const evaluation = asRecord(chunk.evaluation)
				const sourceName =
					typeof chunk.source_name === 'string' ? chunk.source_name : 'Nieznane źródło'
				const page = metadata?.page
				const relevanceScore = evaluation?.relevance_score
				const chunkKey = String(chunk.id ?? chunk.preview ?? sourceName)

				return (
					<Accordion.Item key={chunkKey} value={chunkKey}>
						<Accordion.Control>
							<Group gap='xs'>
								<Badge variant='light'>#{index + 1}</Badge>
								<Text size='sm' fw={500} lineClamp={1}>
									{sourceName}
								</Text>
								{page !== undefined && (
									<Badge variant='outline'>strona {String(page)}</Badge>
								)}
								{showEvaluation && typeof relevanceScore === 'number' && (
									<Badge color={relevanceScore >= 2 ? 'green' : 'orange'}>
										relewancja {relevanceScore}/3
									</Badge>
								)}
							</Group>
						</Accordion.Control>
						<Accordion.Panel>
							<Stack gap='xs'>
								<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
									{typeof chunk.preview === 'string'
										? chunk.preview
										: 'Brak podglądu treści.'}
								</Text>
								{showEvaluation &&
									evaluation &&
									typeof evaluation.evidence === 'string' && (
										<Alert color='gray' title='Ocena chunka' variant='light'>
											{evaluation.evidence}
										</Alert>
									)}
							</Stack>
						</Accordion.Panel>
					</Accordion.Item>
				)
			})}
		</Accordion>
	)
}

function EvaluationList({
	title,
	criteria,
	evaluations,
	forbidden = false,
}: {
	title: string
	criteria: string[]
	evaluations: ResultRecord[]
	forbidden?: boolean
}) {
	return (
		<Paper withBorder p='md' radius='md'>
			<Text fw={600} mb='sm'>
				{title}
			</Text>
			<Stack gap='sm'>
				{criteria.map((criterion, index) => {
					const evaluation = evaluations.find((item) => item.index === index)
					const satisfied = evaluation?.satisfied === true
					const passed = forbidden ? !satisfied : satisfied

					return (
						<div key={criterion}>
							<Group gap='xs' align='flex-start' wrap='nowrap'>
								<Badge color={passed ? 'green' : 'red'} variant='light' mt={2}>
									{forbidden
										? satisfied
											? 'Wystąpiło'
											: 'Nie wystąpiło'
										: satisfied
											? 'Spełnione'
											: 'Niespełnione'}
								</Badge>
								<Stack gap={2}>
									<Text size='sm'>{criterion}</Text>
									{typeof evaluation?.evidence === 'string' &&
										evaluation.evidence && (
											<Text size='xs' c='dimmed'>
												{evaluation.evidence}
											</Text>
										)}
								</Stack>
							</Group>
						</div>
					)
				})}
				{criteria.length === 0 && (
					<Text size='sm' c='dimmed'>
						Brak kryteriów w tej grupie.
					</Text>
				)}
			</Stack>
		</Paper>
	)
}

type AgentPipelineStage = 'message' | 'context' | 'queries' | 'retrieval'

const AGENT_PIPELINE_STAGES: Array<{
	value: AgentPipelineStage
	label: string
	description: string
}> = [
	{ value: 'message', label: 'Wiadomość technika', description: 'Dane wejściowe' },
	{ value: 'context', label: 'Case Context', description: 'Zrozumienie przypadku' },
	{ value: 'queries', label: 'Query Rewrite', description: 'Rozszerzenie zapytań' },
	{ value: 'retrieval', label: 'Retrieval + Reranker', description: 'Wyszukanie dokumentacji' },
]

function AgentPipelineResult({ result }: { result: ResultRecord }) {
	const [selectedStage, setSelectedStage] = useState<AgentPipelineStage | null>(null)
	const caseContext = asRecord(result.case_context)
	const symptom = asRecord(caseContext?.symptom)
	const machine = asRecord(caseContext?.machine)
	const observations = asRecordArray(caseContext?.observations)
	const queryPlan = asRecord(result.query_plan)
	const baseQueries = asStringArray(queryPlan?.base_queries)
	const contextualQueries = asStringArray(queryPlan?.contextual_queries)
	const retrievalQueries = asStringArray(result.retrieval_queries)
	const queryRuns = asRecordArray(result.query_runs)
	const chunksBefore = asRecordArray(result.chunks_before_reranker)
	const chunksAfter = asRecordArray(result.chunks_after_reranker)

	return (
		<Stack gap='lg'>
			<Paper withBorder p='md' radius='md'>
				<Text size='xs' fw={700} tt='uppercase' c='dimmed' mb='sm'>
					Przebieg agenta — wybierz etap
				</Text>
				<Group gap='xs' wrap='nowrap' style={{ overflowX: 'auto' }} pb={4}>
					{AGENT_PIPELINE_STAGES.map((stage, index) => (
						<Group key={stage.value} gap='xs' wrap='nowrap'>
							{index > 0 && (
								<Text size='xl' c='dimmed' aria-hidden>
									→
								</Text>
							)}
							<Button
								variant={selectedStage === stage.value ? 'filled' : 'default'}
								h='auto'
								py='sm'
								px='lg'
								radius='md'
								style={{ minWidth: 180 }}
								aria-pressed={selectedStage === stage.value}
								onClick={() =>
									setSelectedStage((current) =>
										current === stage.value ? null : stage.value,
									)
								}>
								<Stack gap={1} align='center'>
									<Text size='sm' fw={600} c='inherit'>
										{index + 1}. {stage.label}
									</Text>
									<Text
										size='xs'
										c={selectedStage === stage.value ? 'inherit' : 'dimmed'}>
										{stage.description}
									</Text>
								</Stack>
							</Button>
						</Group>
					))}
				</Group>
			</Paper>

			<Collapse expanded={selectedStage !== null}>
				<Stack gap='lg'>
					{selectedStage === 'message' && (
						<section>
							<Title order={4} mb='sm'>
								1. Wiadomość technika
							</Title>
							<Paper withBorder p='md' radius='md'>
								<Text size='sm'>
									{typeof result.question === 'string'
										? result.question
										: 'Brak wiadomości.'}
								</Text>
							</Paper>
						</section>
					)}

					{selectedStage === 'context' && (
						<section>
							<Title order={4} mb='sm'>
								2. Case Context
							</Title>
							<SimpleGrid cols={{ base: 1, lg: 3 }} spacing='sm'>
								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Symptom
									</Text>
									<Stack gap='xs'>
										<div>
											<Text size='xs' c='dimmed'>
												Surowy opis
											</Text>
											<Text size='sm'>{String(symptom?.raw ?? '—')}</Text>
										</div>
										<div>
											<Text size='xs' c='dimmed'>
												Znormalizowana fraza
											</Text>
											<Text size='sm' fw={500}>
												{String(symptom?.search_phrase ?? '—')}
											</Text>
										</div>
									</Stack>
								</Paper>

								<Paper withBorder p='md' radius='md'>
									<Group justify='space-between' mb='sm'>
										<Text fw={600}>Observations</Text>
										<Badge variant='light'>{observations.length}</Badge>
									</Group>
									<Stack gap='sm'>
										{observations.map((observation) => (
											<div
												key={`${String(observation.type)}-${String(observation.value)}`}>
												<Group gap='xs'>
													<Badge variant='light'>
														{String(observation.type)}
													</Badge>
													<Badge
														color={
															observation.certainty === 'certain'
																? 'green'
																: 'yellow'
														}
														variant='outline'>
														{String(observation.certainty)}
													</Badge>
												</Group>
												<Text size='sm' mt={4}>
													{String(observation.value)}
												</Text>
											</div>
										))}
										{observations.length === 0 && (
											<Text size='sm' c='dimmed'>
												Brak jawnych obserwacji.
											</Text>
										)}
									</Stack>
								</Paper>

								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Machine context
									</Text>
									<Stack gap={6}>
										<Text size='sm'>
											ID: {String(machine?.device_id ?? '—')}
										</Text>
										<Text size='sm'>Nazwa: {String(machine?.name ?? '—')}</Text>
										<Text size='sm'>
											Model/serial:{' '}
											{String(machine?.model_serial_code ?? '—')}
										</Text>
										<Text size='sm'>
											Dane tabliczki:{' '}
											{machine?.nameplate_data ? 'dostępne' : 'brak'}
										</Text>
										{machine?.nameplate_data !== null &&
											machine?.nameplate_data !== undefined && (
												<CodeHighlight
													code={JSON.stringify(
														machine.nameplate_data,
														null,
														2,
													)}
													language='json'
												/>
											)}
									</Stack>
								</Paper>
							</SimpleGrid>
						</section>
					)}

					{selectedStage === 'queries' && (
						<section>
							<Title order={4} mb='sm'>
								3. Query Rewrite & Expansion
							</Title>
							<SimpleGrid cols={{ base: 1, md: 2 }} spacing='sm'>
								<CriteriaList
									title='Base queries'
									items={baseQueries}
									color='blue'
								/>
								<CriteriaList
									title='Contextual queries'
									items={contextualQueries}
									color='cyan'
								/>
							</SimpleGrid>
							<Paper withBorder p='md' radius='md' mt='sm'>
								<Text fw={600} size='sm' mb='xs'>
									Kolejność zapytań przekazanych do retrievalu
								</Text>
								<List type='ordered' size='sm' spacing='xs'>
									{retrievalQueries.map((query) => (
										<List.Item key={query}>{query}</List.Item>
									))}
								</List>
							</Paper>
						</section>
					)}

					{selectedStage === 'retrieval' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>4. Retrieval + Reranker</Title>
								<Group gap='xs'>
									<Badge variant='light'>{queryRuns.length} zapytań</Badge>
									{typeof result.reranker_status === 'string' && (
										<Badge
											color={
												result.reranker_status === 'applied'
													? 'green'
													: 'gray'
											}>
											{result.reranker_status}
										</Badge>
									)}
								</Group>
							</Group>

							<Accordion variant='separated' multiple mb='md'>
								{queryRuns.map((queryRun, index) => {
									const chunks = asRecordArray(queryRun.chunks)
									const query = String(queryRun.query ?? `Zapytanie ${index + 1}`)
									return (
										<Accordion.Item key={query} value={query}>
											<Accordion.Control>
												<Group gap='xs'>
													<Badge variant='light'>#{index + 1}</Badge>
													<Text size='sm' fw={500}>
														{query}
													</Text>
													<Badge variant='outline'>
														kandydaci: {chunks.length}
													</Badge>
												</Group>
											</Accordion.Control>
											<Accordion.Panel>
												<ChunkList chunks={chunks} showEvaluation={false} />
											</Accordion.Panel>
										</Accordion.Item>
									)
								})}
							</Accordion>

							<Paper withBorder p='md' radius='md'>
								<Group justify='space-between' mb='sm'>
									<Text fw={600}>Wynik łączny</Text>
									<Badge variant='outline'>RRF → globalny reranker</Badge>
								</Group>
								{typeof result.global_reranker_query === 'string' && (
									<Alert
										color='gray'
										variant='light'
										title='Zapytanie globalnego rerankera'
										mb='sm'>
										<Text size='xs' style={{ whiteSpace: 'pre-wrap' }}>
											{result.global_reranker_query}
										</Text>
									</Alert>
								)}
								<SimpleGrid cols={{ base: 1, xl: 2 }} spacing='md'>
									<div>
										<Text fw={600} size='sm' mb='xs'>
											Po połączeniu i deduplikacji RRF
										</Text>
										<ChunkList chunks={chunksBefore} showEvaluation={false} />
									</div>
									<div>
										<Text fw={600} size='sm' mb='xs'>
											Po globalnym rerankerze
										</Text>
										<ChunkList chunks={chunksAfter} showEvaluation={false} />
									</div>
								</SimpleGrid>
							</Paper>
							<Alert color='green' title='Koniec obecnego zakresu agenta' mt='md'>
								Pipeline zakończył się po retrievalu i rerankerze. Odpowiedź nie
								została wygenerowana.
							</Alert>
						</section>
					)}
				</Stack>
			</Collapse>
		</Stack>
	)
}

function CaseRunResult({ runId, testCase }: { runId: string; testCase: BenchmarkCase }) {
	const { data: run } = useCaseRun(runId)
	const cancelRun = useCancelCaseRun()
	const [chunksOpened, { toggle: toggleChunks }] = useDisclosure(false)

	if (!run) return <Loader size='sm' />

	const result = run.result ?? {}
	const score = typeof result.score === 'number' ? result.score : undefined
	const passed = typeof result.passed === 'boolean' ? result.passed : undefined
	const answer = typeof result.answer === 'string' ? result.answer : undefined
	const chunksBeforeReranker = asRecordArray(result.chunks_before_reranker)
	const chunksAfterReranker = asRecordArray(result.chunks_after_reranker)
	const judge = asRecord(result.judge)
	const requiredFacts = asRecordArray(judge?.required_facts)
	const requiredBehaviors = asRecordArray(judge?.required_behaviors)
	const forbiddenClaims = asRecordArray(judge?.forbidden_claims)
	const isActive = run.state === 'queued' || run.state === 'processing'
	const isAgentPipeline =
		result.mode === 'agent' && result.pipeline_stage === 'retrieval_completed'

	return (
		<Stack gap='lg' mt='lg'>
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
			{run.result && isAgentPipeline && <AgentPipelineResult result={result} />}
			{run.result && !isAgentPipeline && (
				<>
					<section>
						<Title order={4} mb='sm'>
							1. Odpowiedź
						</Title>
						<Paper withBorder p='md' radius='md'>
							<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
								{answer || 'Model nie zwrócił odpowiedzi.'}
							</Text>
						</Paper>
					</section>

					<Paper withBorder radius='md'>
						<UnstyledButton
							onClick={toggleChunks}
							aria-expanded={chunksOpened}
							aria-controls={`benchmark-run-${run.id}-chunks`}
							p='md'
							style={{ width: '100%' }}>
							<Group justify='space-between' wrap='nowrap'>
								<Group gap='xs'>
									<Title order={4}>2–3. Chunki retrievalu</Title>
									{chunksOpened ? (
										<IconChevronUp size={16} />
									) : (
										<IconChevronDown size={16} />
									)}
								</Group>
								<Group gap='xs'>
									<Badge variant='light'>
										przed: {chunksBeforeReranker.length}
									</Badge>
									<Badge variant='light'>po: {chunksAfterReranker.length}</Badge>
									{typeof result.reranker_status === 'string' && (
										<Badge
											color={
												result.reranker_status === 'applied'
													? 'green'
													: 'gray'
											}>
											{result.reranker_status}
										</Badge>
									)}
								</Group>
							</Group>
						</UnstyledButton>
						<Collapse expanded={chunksOpened} id={`benchmark-run-${run.id}-chunks`}>
							<SimpleGrid cols={{ base: 1, xl: 2 }} spacing='md' p='md' pt={0}>
								<section>
									<Group justify='space-between' mb='sm'>
										<Title order={5}>Przed rerankerem</Title>
										<Badge variant='light'>{chunksBeforeReranker.length}</Badge>
									</Group>
									<ChunkList
										chunks={chunksBeforeReranker}
										showEvaluation={false}
									/>
								</section>
								<section>
									<Group justify='space-between' mb='sm'>
										<Title order={5}>Po rerankerze</Title>
										<Badge variant='light'>{chunksAfterReranker.length}</Badge>
									</Group>
									<ChunkList chunks={chunksAfterReranker} showEvaluation />
								</section>
							</SimpleGrid>
						</Collapse>
					</Paper>

					<section>
						<Title order={4} mb='sm'>
							4. Ocena odpowiedzi
						</Title>
						<Stack gap='sm'>
							<EvaluationList
								title='Wymagane fakty'
								criteria={testCase.required_facts}
								evaluations={requiredFacts}
							/>
							<EvaluationList
								title='Wymagane zachowanie'
								criteria={testCase.required_behaviors}
								evaluations={requiredBehaviors}
							/>
							<EvaluationList
								title='Zakazane twierdzenia'
								criteria={testCase.forbidden_claims}
								evaluations={forbiddenClaims}
								forbidden
							/>
							{typeof judge?.feedback === 'string' && judge.feedback && (
								<Alert
									color={passed ? 'green' : 'orange'}
									title='Podsumowanie oceny'>
									{judge.feedback}
								</Alert>
							)}
						</Stack>
					</section>
				</>
			)}
		</Stack>
	)
}

interface CaseItemProps {
	testCase: BenchmarkCase
	runId: string | null
	onRunStarted: (caseId: string, runId: string) => void
}

function CriteriaList({ title, items, color }: { title: string; items: string[]; color: string }) {
	return (
		<Paper withBorder p='md' radius='md'>
			<Group justify='space-between' mb='xs'>
				<Text fw={600} size='sm'>
					{title}
				</Text>
				<Badge color={color} variant='light'>
					{items.length}
				</Badge>
			</Group>
			{items.length > 0 ? (
				<List size='sm' spacing='xs'>
					{items.map((item) => (
						<List.Item key={item}>{item}</List.Item>
					))}
				</List>
			) : (
				<Text size='sm' c='dimmed'>
					Brak dodatkowych warunków.
				</Text>
			)}
		</Paper>
	)
}

function CaseItem({ testCase, runId, onRunStarted }: CaseItemProps) {
	const startRun = useStartCaseRun()

	function handleRun() {
		modals.openConfirmModal({
			title: 'Uruchomić przypadek testowy?',
			children: <Text size='sm'>„{testCase.title}”</Text>,
			labels: { confirm: 'Uruchom', cancel: 'Anuluj' },
			onConfirm: () => {
				startRun.mutate(testCase.id, {
					onSuccess: (run) => onRunStarted(testCase.id, run.id),
				})
			},
		})
	}

	return (
		<Card withBorder>
			<Group justify='space-between' align='flex-start'>
				<Stack gap={6}>
					<Title order={4}>{testCase.title}</Title>
					<Group gap='xs'>
						<Badge variant='light'>{testCase.category}</Badge>
						<Badge variant='outline'>{testCase.expected_route}</Badge>
						{testCase.canonical_fault_code && (
							<Badge color='orange' variant='light'>
								kod {testCase.canonical_fault_code}
							</Badge>
						)}
					</Group>
				</Stack>
				<Button size='xs' loading={startRun.isPending} onClick={handleRun}>
					Uruchom
				</Button>
			</Group>

			<Stack gap='md' mt='lg'>
				<div>
					<Text size='xs' fw={700} tt='uppercase' c='dimmed' mb={6}>
						Pytanie
					</Text>
					<Paper p='md' radius='md' bg='var(--mantine-color-blue-light)'>
						<Text fw={500}>„{testCase.question}”</Text>
					</Paper>
				</div>

				{testCase.mode === 'standard' ? (
					<div>
						<Text size='xs' fw={700} tt='uppercase' c='dimmed' mb={6}>
							Warunki oceny
						</Text>
						<SimpleGrid cols={{ base: 1, lg: 3 }} spacing='sm'>
							<CriteriaList
								title='Wymagane fakty'
								items={testCase.required_facts}
								color='green'
							/>
							<CriteriaList
								title='Wymagane zachowanie'
								items={testCase.required_behaviors}
								color='blue'
							/>
							<CriteriaList
								title='Niedozwolone twierdzenia'
								items={testCase.forbidden_claims}
								color='red'
							/>
						</SimpleGrid>
					</div>
				) : (
					<Alert color='cyan' variant='light' title='Zakres uruchomienia agenta'>
						Case Context → Query Rewrite & Expansion → Retrieval + Reranker. Generowanie
						odpowiedzi nie jest jeszcze uruchamiane.
					</Alert>
				)}
			</Stack>
			{runId && <CaseRunResult runId={runId} testCase={testCase} />}
		</Card>
	)
}

function CasesSection() {
	const { data, isLoading } = useBenchmarkCases()
	const [selectedMode, setSelectedMode] = useState<'standard' | 'agent'>('standard')
	const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
	const [runIds, setRunIds] = useState<Record<string, string>>({})
	const modeCases = data?.cases.filter((testCase) => testCase.mode === selectedMode) ?? []
	const selectedCase =
		modeCases.find((testCase) => testCase.id === selectedCaseId) ?? modeCases[0]
	const standardCount = data?.cases.filter((testCase) => testCase.mode === 'standard').length ?? 0
	const agentCount = data?.cases.filter((testCase) => testCase.mode === 'agent').length ?? 0

	function handleRunStarted(caseId: string, runId: string) {
		setRunIds((current) => ({ ...current, [caseId]: runId }))
	}

	return (
		<Stack gap='sm'>
			<Title order={4}>
				Przypadki testowe {data ? `(${data.cases.length}, v${data.version})` : ''}
			</Title>
			{isLoading ? (
				<Loader size='sm' />
			) : data ? (
				<>
					<div>
						<Text size='xs' fw={700} tt='uppercase' c='dimmed' mb={6}>
							Tryb
						</Text>
						<SegmentedControl
							value={selectedMode}
							onChange={(value) => {
								setSelectedMode(value as 'standard' | 'agent')
								setSelectedCaseId(null)
							}}
							data={[
								{ label: `Standard (${standardCount})`, value: 'standard' },
								{ label: `Agent (${agentCount})`, value: 'agent' },
							]}
						/>
					</div>

					<Text size='xs' fw={700} tt='uppercase' c='dimmed'>
						Przypadek testowy
					</Text>
					<Group gap='xs'>
						{modeCases.map((testCase, index) => (
							<Button
								key={testCase.id}
								size='compact-sm'
								variant={selectedCase?.id === testCase.id ? 'filled' : 'default'}
								aria-label={`Pokaż przypadek ${index + 1}: ${testCase.title}`}
								onClick={() => setSelectedCaseId(testCase.id)}>
								{index + 1}
							</Button>
						))}
					</Group>
					{selectedCase ? (
						<CaseItem
							testCase={selectedCase}
							runId={runIds[selectedCase.id] ?? null}
							onRunStarted={handleRunStarted}
						/>
					) : (
						<Text c='dimmed'>Brak przypadków testowych dla tego trybu.</Text>
					)}
				</>
			) : (
				<Text c='dimmed'>Brak przypadków testowych.</Text>
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
			<CasesSection />
		</Stack>
	)
}
