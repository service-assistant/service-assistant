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
	Switch,
	Text,
	Title,
	UnstyledButton,
} from '@mantine/core'
import { useClipboard, useDisclosure } from '@mantine/hooks'
import { IconCheck, IconChevronDown, IconChevronUp, IconCopy } from '@tabler/icons-react'
import { useState } from 'react'
import {
	useBenchmarkCases,
	useCancelCaseRun,
	useCaseRun,
	useSetupRun,
	useStartCaseRun,
	useStartSetupRun,
} from '@/hooks/useBenchmark'
import { formatBenchmarkCaseForClipboard } from '@/lib/benchmarkClipboard'
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

function formatDuration(value: unknown): string | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
	if (value < 1000) return `${Math.round(value)} ms`
	return `${(value / 1000).toFixed(2)} s`
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
				const rerankerScore = chunk.reranker_score
				const chunkKey = String(chunk.id ?? chunk.preview ?? sourceName)

				return (
					<Accordion.Item key={chunkKey} value={chunkKey}>
						<Accordion.Control>
							<Group gap='xs' wrap='wrap' align='flex-start'>
								<Badge variant='light'>#{index + 1}</Badge>
								<Text
									size='sm'
									fw={500}
									style={{ minWidth: 180, flex: 1, overflowWrap: 'anywhere' }}>
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
								{typeof rerankerScore === 'number' && (
									<Badge color='grape' variant='light'>
										reranker {rerankerScore.toFixed(3)}
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

function ExtractorRuleCard({
	rule,
	index,
	chunks,
}: {
	rule: ResultRecord
	index: number
	chunks: ResultRecord[]
}) {
	const [chunksOpened, { toggle }] = useDisclosure(false)
	const sourceChunkIds = new Set(
		(Array.isArray(rule.source_chunk_ids) ? rule.source_chunk_ids : []).map(String),
	)
	const linkedChunks = chunks.filter((chunk) => sourceChunkIds.has(String(chunk.id)))
	const missingChunkCount = Math.max(0, sourceChunkIds.size - linkedChunks.length)

	return (
		<Paper withBorder p='md' radius='md'>
			<Group gap='xs' mb='sm'>
				<Badge>Reguła {index + 1}</Badge>
			</Group>
			<CodeHighlight
				className='diagnostic-state-json'
				code={JSON.stringify(rule, null, 2)}
				language='json'
			/>
			<Button
				mt='sm'
				size='compact-sm'
				variant={chunksOpened ? 'light' : 'default'}
				rightSection={
					chunksOpened ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
				}
				onClick={toggle}
				aria-expanded={chunksOpened}
				aria-controls={`extractor-rule-${index}-chunks`}>
				{chunksOpened ? 'Ukryj powiązane chunki' : 'Pokaż powiązane chunki'} (
				{linkedChunks.length})
			</Button>
			<Collapse expanded={chunksOpened} id={`extractor-rule-${index}-chunks`}>
				<Stack gap='xs' mt='sm'>
					<ChunkList chunks={linkedChunks} showEvaluation={false} />
					{missingChunkCount > 0 && (
						<Alert color='yellow' variant='light'>
							{missingChunkCount === 1
								? 'Jeden wskazany chunk nie jest dostępny w danych wejściowych extractora.'
								: `${missingChunkCount} wskazane chunki nie są dostępne w danych wejściowych extractora.`}
						</Alert>
					)}
				</Stack>
			</Collapse>
		</Paper>
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

type AgentPipelineStage =
	| 'message'
	| 'context'
	| 'queries'
	| 'retrieval'
	| 'extractor'
	| 'evidence'
	| 'state'
	| 'gaps'
	| 'next'
	| 'simulation'
	| 'final'
	| 'judge'

const AGENT_PIPELINE_STAGES: Array<{
	value: AgentPipelineStage
	label: string
	description: string
}> = [
	{ value: 'message', label: 'Wiadomość technika', description: 'Dane wejściowe' },
	{ value: 'context', label: 'Case Context', description: 'Zrozumienie przypadku' },
	{ value: 'queries', label: 'Query Rewrite', description: 'Rozszerzenie zapytań' },
	{ value: 'retrieval', label: 'Retrieval + Reranker', description: 'Wyszukanie dokumentacji' },
	{ value: 'extractor', label: 'Diagnostic Extractor', description: 'Reguły z cytatami' },
	{ value: 'evidence', label: 'Evidence Gate', description: 'Deterministyczne accept/refuse' },
	{ value: 'state', label: 'Diagnostic State', description: 'Initial diagnostic state' },
	{ value: 'gaps', label: 'Gap Finder', description: 'Brakujące informacje' },
	{ value: 'next', label: 'Best Next Step', description: 'Ocena i wybór kroku' },
	{
		value: 'simulation',
		label: 'Symulacja technika',
		description: 'Odpowiedzi i aktualizacja faktów',
	},
	{ value: 'final', label: 'Final Answer', description: 'Akcje dopasowanych reguł' },
	{ value: 'judge', label: 'Judge', description: 'Końcowa ocena odpowiedzi' },
]

function AgentPipelineResult({
	result,
	testCase,
}: {
	result: ResultRecord
	testCase: BenchmarkCase
}) {
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
	const chunksAfterPrefilter = asRecordArray(result.chunks_after_evidence_gate)
	const initialEvidenceGate = asRecord(result.initial_evidence_gate)
	const extraction = asRecord(result.diagnostic_extraction)
	const extractedRules = asRecordArray(extraction?.rules)
	const evidenceGate = asRecord(result.evidence_gate)
	const ruleEvaluations = asRecordArray(evidenceGate?.rule_evaluations)
	const gateFailures = asRecordArray(evidenceGate?.failures)
	const finalDiagnosticState = asRecord(result.diagnostic_state)
	const diagnosticState =
		asRecord(result.diagnostic_state_before_simulation) ?? finalDiagnosticState
	const diagnosticFacts = asRecordArray(diagnosticState?.facts)
	const diagnosticRules = asRecordArray(diagnosticState?.rules)
	const diagnosticRuleStates = asRecordArray(diagnosticState?.rule_states)
	const diagnosticGaps = asRecordArray(diagnosticState?.gaps)
	const agentNextStep = asRecord(result.agent_next_step)
	const recordedNextStepDecisions = asRecordArray(result.agent_next_step_decisions)
	const agentNextStepDecisions =
		recordedNextStepDecisions.length > 0
			? recordedNextStepDecisions
			: agentNextStep
				? [agentNextStep]
				: []
	const agentSimulationSteps = asRecordArray(result.agent_simulation_steps)
	const finalDiagnosticAnswer = asRecord(result.final_diagnostic_answer)
	const finalAnswerCompleted = String(finalDiagnosticAnswer?.status ?? '').startsWith('completed')
	const judge = asRecord(result.judge)
	const requiredFacts = asRecordArray(judge?.required_facts)
	const requiredBehaviors = asRecordArray(judge?.required_behaviors)
	const forbiddenClaims = asRecordArray(judge?.forbidden_claims)
	const evaluationSkipped = result.evaluation_skipped === true
	const displayedGateFailures =
		gateFailures.length > 0 || evidenceGate?.decision !== 'refuse' || extractedRules.length > 0
			? gateFailures
			: [
					{
						rule_index: null,
						attribute: 'rules',
						code: 'no_rules_extracted',
						message: 'Extractor nie zwrócił żadnej kandydackiej reguły do walidacji.',
					},
				]
	const stageTimings = asRecord(result.stage_timings_ms)
	const preparationTime = formatDuration(stageTimings?.case_context_and_query_rewrite)
	const retrievalTime = formatDuration(stageTimings?.retrieval_and_reranker)
	const extractorTime = formatDuration(stageTimings?.diagnostic_extractor)
	const evidenceTime = formatDuration(stageTimings?.evidence_gate)
	const stateTime = formatDuration(stageTimings?.diagnostic_state)
	const gapFinderTime = formatDuration(stageTimings?.gap_finder)
	const nextBestStepTime = formatDuration(stageTimings?.next_best_step)
	const totalTime = formatDuration(result.total_time_ms)
	const stageTime: Record<AgentPipelineStage, string | null> = {
		message: formatDuration(stageTimings?.message),
		context: preparationTime ? `${preparationTime} wspólnie z Query Rewrite` : null,
		queries: preparationTime ? `${preparationTime} wspólnie z Case Context` : null,
		retrieval: retrievalTime,
		extractor: extractorTime,
		evidence: evidenceTime,
		state: stateTime,
		gaps: gapFinderTime,
		next: nextBestStepTime,
		simulation: null,
		final: null,
		judge: formatDuration(stageTimings?.evaluation),
	}

	return (
		<Stack gap='lg'>
			<Paper withBorder p='md' radius='md'>
				<Group justify='space-between' align='center' mb='sm'>
					<Text size='xs' fw={700} tt='uppercase' c='dimmed'>
						Przebieg agenta — wybierz etap
					</Text>
					{totalTime && (
						<Badge color='blue' variant='light' size='lg'>
							Łącznie: {totalTime}
						</Badge>
					)}
				</Group>
				<SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing='xs'>
					{AGENT_PIPELINE_STAGES.map((stage, index) => (
						<Button
							key={stage.value}
							variant={selectedStage === stage.value ? 'filled' : 'default'}
							h='100%'
							py='sm'
							px='md'
							radius='md'
							style={{ width: '100%', minWidth: 0, whiteSpace: 'normal' }}
							aria-pressed={selectedStage === stage.value}
							onClick={() =>
								setSelectedStage((current) =>
									current === stage.value ? null : stage.value,
								)
							}>
							<Stack gap={2} align='center' style={{ minWidth: 0 }}>
								<Text
									size='sm'
									fw={600}
									c='inherit'
									style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
									{index + 1}. {stage.label}
								</Text>
								<Text
									size='xs'
									c={selectedStage === stage.value ? 'inherit' : 'dimmed'}
									style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
									{stage.description}
								</Text>
								{stageTime[stage.value] && (
									<Text
										size='xs'
										fw={700}
										c={selectedStage === stage.value ? 'inherit' : 'blue'}>
										{stageTime[stage.value]}
									</Text>
								)}
							</Stack>
						</Button>
					))}
				</SimpleGrid>
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
									<CodeHighlight
										className='diagnostic-state-json'
										code={JSON.stringify(symptom ?? {}, null, 2)}
										language='json'
									/>
								</Paper>

								<Paper withBorder p='md' radius='md'>
									<Group justify='space-between' mb='sm'>
										<Text fw={600}>Observations</Text>
										<Badge variant='light'>{observations.length}</Badge>
									</Group>
									<Stack gap='sm'>
										{observations.map((observation) => (
											<Paper
												key={JSON.stringify(observation)}
												withBorder
												p='sm'
												radius='sm'>
												<CodeHighlight
													className='diagnostic-state-json'
													code={JSON.stringify(observation, null, 2)}
													language='json'
												/>
											</Paper>
										))}
										{observations.length === 0 && (
											<Text size='sm' c='dimmed'>
												No explicit observations.
											</Text>
										)}
									</Stack>
								</Paper>

								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Machine context
									</Text>
									<CodeHighlight
										className='diagnostic-state-json'
										code={JSON.stringify(machine ?? {}, null, 2)}
										language='json'
									/>
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
								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Base queries
									</Text>
									<CodeHighlight
										className='diagnostic-state-json'
										code={JSON.stringify(baseQueries, null, 2)}
										language='json'
									/>
								</Paper>
								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Contextual queries
									</Text>
									<CodeHighlight
										className='diagnostic-state-json'
										code={JSON.stringify(contextualQueries, null, 2)}
										language='json'
									/>
								</Paper>
							</SimpleGrid>
							<Paper withBorder p='md' radius='md' mt='sm'>
								<Text fw={600} size='sm' mb='xs'>
									Retrieval query order
								</Text>
								<CodeHighlight
									className='diagnostic-state-json'
									code={JSON.stringify(retrievalQueries, null, 2)}
									language='json'
								/>
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
							<Paper withBorder p='sm' radius='sm' mt='md'>
								<Text fw={600} size='sm'>
									Oś czasu Retrieval + Reranker
								</Text>
								<RetrievalTimeline result={result} />
								<Text size='xs' c='dimmed' mt='sm'>
									Chunki i embedding wszystkich zapytań są pobierane równolegle.
									Q1…Qn korzystają z gotowych wektorów i są już po angielsku po
									Query Rewrite, więc tłumaczenie jest pomijane. Po połączeniu
									wyników uruchamiany jest globalny reranker.
								</Text>
							</Paper>
							<Alert
								color='gray'
								variant='light'
								title='Tani prefilter rerankera'
								mt='md'>
								{String(initialEvidenceGate?.decision ?? 'brak wyniku')} —{' '}
								{String(initialEvidenceGate?.reason ?? 'brak szczegółów')}. Do
								extractora przekazano {chunksAfterPrefilter.length} chunków.
							</Alert>
						</section>
					)}

					{selectedStage === 'extractor' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>5. Diagnostic Extractor</Title>
								<Group gap='xs'>
									<Badge variant='outline'>
										{String(result.diagnostic_extractor_model ?? '—')}
									</Badge>
									<Badge variant='light'>{extractedRules.length} reguł</Badge>
								</Group>
							</Group>
							<Stack gap='sm'>
								{extractedRules.map((rule, index) => (
									<ExtractorRuleCard
										key={JSON.stringify(rule)}
										rule={rule}
										index={index}
										chunks={chunksAfterPrefilter}
									/>
								))}
								{extractedRules.length === 0 && (
									<Alert color='yellow'>
										{String(
											extraction?.evidence_gap ??
												'Extractor nie znalazł reguł.',
										)}
									</Alert>
								)}
							</Stack>
						</section>
					)}

					{selectedStage === 'evidence' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>6. Evidence Gate</Title>
								<Badge
									color={evidenceGate?.decision === 'accept' ? 'green' : 'red'}
									size='lg'>
									{String(evidenceGate?.decision ?? 'brak wyniku').toUpperCase()}
								</Badge>
							</Group>

							<Alert
								color={evidenceGate?.decision === 'accept' ? 'green' : 'red'}
								title='Werdykt po walidacji reguł'
								mb='md'>
								{String(evidenceGate?.reason ?? 'Brak danych z gate’u.')}
							</Alert>

							<Paper withBorder p='md' radius='md' mt='md'>
								<Group justify='space-between' mb='sm'>
									<Text fw={600}>Co dokładnie zawiodło</Text>
									<Badge
										color={displayedGateFailures.length > 0 ? 'red' : 'green'}
										variant='light'>
										{displayedGateFailures.length} błędów
									</Badge>
								</Group>
								<Stack gap='xs'>
									{displayedGateFailures.map((failure) => (
										<Alert
											key={`${String(failure.rule_index)}-${String(failure.attribute)}-${String(failure.code)}`}
											color='red'
											variant='light'
											title={`${String(failure.attribute)} → ${String(failure.code)}`}>
											{String(failure.message)}
										</Alert>
									))}
									{displayedGateFailures.length === 0 && (
										<Text size='sm' c='dimmed'>
											Wszystkie wymagane atrybuty zaakceptowanych reguł
											przeszły walidację.
										</Text>
									)}
								</Stack>
							</Paper>

							<Paper withBorder p='md' radius='md' mt='md'>
								<Group justify='space-between' mb='sm'>
									<Text fw={600}>Surowe oceny reguł</Text>
									<Badge variant='outline'>{ruleEvaluations.length} ocen</Badge>
								</Group>
								<CodeHighlight
									code={JSON.stringify(ruleEvaluations, null, 2)}
									language='json'
								/>
							</Paper>

							<Alert color='blue' title='Przekazanie do Diagnostic State' mt='md'>
								Zaakceptowane reguły zostaną użyte do przygotowania początkowego
								stanu diagnozy.
							</Alert>
						</section>
					)}

					{selectedStage === 'state' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>7. Diagnostic State</Title>
								<Badge
									color={diagnosticState?.status === 'ready' ? 'green' : 'yellow'}
									size='lg'>
									{String(diagnosticState?.status ?? 'no state').toUpperCase()}
								</Badge>
							</Group>
							<SimpleGrid cols={{ base: 1, md: 3 }} spacing='md'>
								<Paper withBorder p='md' radius='md'>
									<Text fw={600}>Initial facts</Text>
									<Badge variant='light' mt='xs'>
										{diagnosticFacts.length}
									</Badge>
								</Paper>
								<Paper withBorder p='md' radius='md'>
									<Text fw={600}>Accepted rules</Text>
									<Badge variant='light' mt='xs'>
										{diagnosticRules.length}
									</Badge>
								</Paper>
								<Paper withBorder p='md' radius='md'>
									<Text fw={600}>Rule evaluations</Text>
									<Badge variant='light' mt='xs'>
										{diagnosticRuleStates.length}
									</Badge>
								</Paper>
							</SimpleGrid>
							<SimpleGrid cols={{ base: 1, lg: 2 }} spacing='md' mt='md'>
								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Facts
									</Text>
									<Stack gap='sm'>
										{diagnosticFacts.map((fact) => (
											<Paper
												key={JSON.stringify(fact)}
												withBorder
												p='sm'
												radius='sm'>
												<CodeHighlight
													className='diagnostic-state-json'
													code={JSON.stringify(fact, null, 2)}
													language='json'
												/>
											</Paper>
										))}
										{diagnosticFacts.length === 0 && (
											<Text size='sm' c='dimmed'>
												No initial facts.
											</Text>
										)}
									</Stack>
								</Paper>

								<Paper withBorder p='md' radius='md'>
									<Text fw={600} mb='sm'>
										Rule matching
									</Text>
									<Accordion variant='separated' multiple>
										{diagnosticRuleStates.map((ruleState, index) => {
											const rule = diagnosticRules[index]
											const status = String(ruleState.status ?? 'unknown')
											const ruleNumber =
												Number(ruleState.extraction_rule_index ?? index) + 1
											return (
												<Accordion.Item
													key={`${ruleNumber}-${status}`}
													value={`${ruleNumber}-${status}`}>
													<Accordion.Control>
														<Group gap='xs' wrap='wrap'>
															<Badge>Rule {ruleNumber}</Badge>
															<Badge
																color={
																	status === 'matched'
																		? 'green'
																		: 'yellow'
																}>
																{status}
															</Badge>
														</Group>
													</Accordion.Control>
													<Accordion.Panel>
														<CodeHighlight
															className='diagnostic-state-json'
															code={JSON.stringify(
																{
																	rule: rule ?? null,
																	matching: ruleState,
																},
																null,
																2,
															)}
															language='json'
														/>
													</Accordion.Panel>
												</Accordion.Item>
											)
										})}
									</Accordion>
									{diagnosticRuleStates.length === 0 && (
										<Text size='sm' c='dimmed'>
											No accepted rules to evaluate.
										</Text>
									)}
								</Paper>
							</SimpleGrid>
							<Alert color='blue' title='Przekazanie do Gap Finder' mt='md'>
								Fakty i zaakceptowane reguły zostaną porównane, a wynik zapisany w
								tym samym Diagnostic State.
							</Alert>
						</section>
					)}

					{selectedStage === 'gaps' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>8. Gap Finder</Title>
								<Badge
									color={
										diagnosticState?.status === 'ready'
											? 'green'
											: diagnosticState?.status === 'conflicting'
												? 'red'
												: 'yellow'
									}
									size='lg'>
									{String(diagnosticState?.status ?? 'no state').toUpperCase()}
								</Badge>
							</Group>

							<Paper withBorder p='md' radius='md'>
								<Group justify='space-between' mb='sm'>
									<Text fw={600}>Unresolved diagnostic gaps</Text>
									<Badge
										color={diagnosticGaps.length > 0 ? 'yellow' : 'green'}
										variant='light'>
										{diagnosticGaps.length}
									</Badge>
								</Group>
								<Stack gap='sm'>
									{diagnosticGaps.map((gap) => {
										const kind = String(gap.kind ?? 'unknown')
										return (
											<Paper
												key={JSON.stringify([
													gap.fact_key,
													gap.operator,
													gap.expected_value,
													gap.unit,
												])}
												withBorder
												p='sm'
												radius='sm'>
												<Group gap='xs' mb='sm'>
													<Badge>
														{String(gap.fact_key ?? 'unknown fact')}
													</Badge>
													<Badge
														color={
															kind === 'conflicting'
																? 'red'
																: kind === 'uncertain'
																	? 'orange'
																	: 'yellow'
														}
														variant='light'>
														{kind}
													</Badge>
												</Group>
												<CodeHighlight
													className='diagnostic-state-json'
													code={JSON.stringify(gap, null, 2)}
													language='json'
												/>
											</Paper>
										)
									})}
									{diagnosticGaps.length === 0 && (
										<Alert color='green' variant='light'>
											No unresolved diagnostic gaps were found.
										</Alert>
									)}
								</Stack>
							</Paper>

							<Paper withBorder p='md' radius='md' mt='md'>
								<Text fw={600} mb='sm'>
									Diagnostic State after gap enrichment
								</Text>
								<CodeHighlight
									className='diagnostic-state-json'
									code={JSON.stringify(
										{
											status: diagnosticState?.status,
											rule_states: diagnosticRuleStates,
											gaps: diagnosticGaps,
										},
										null,
										2,
									)}
									language='json'
								/>
							</Paper>

							<Alert color='blue' title='Przekazanie do Best Next Step' mt='md'>
								Zidentyfikowane luki zostaną ocenione semantycznie, a końcowy wynik
								zostanie wybrany deterministycznie po walidacji referencji.
							</Alert>
						</section>
					)}

					{selectedStage === 'next' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>9. Best Next Step</Title>
								<Group gap='xs'>
									<Badge variant='outline'>
										{String(result.agent_next_step_model ?? '—')}
									</Badge>
									<Badge variant='light' size='lg'>
										{agentNextStepDecisions.length} decyzji
									</Badge>
								</Group>
							</Group>

							<Stack gap='md'>
								{agentNextStepDecisions.map((decision) => {
									const selected = asRecord(decision.selected)
									return (
										<Paper
											key={JSON.stringify(decision)}
											withBorder
											p='md'
											radius='md'>
											<Group justify='space-between' mb='sm'>
												<Text fw={600}>Wynik Best Next Step</Text>
												<Badge
													color={
														decision.status === 'selected'
															? 'green'
															: 'gray'
													}>
													{String(
														decision.status ?? 'no result',
													).toUpperCase()}
												</Badge>
											</Group>
											{typeof selected?.technician_prompt === 'string' && (
												<Alert
													color='blue'
													title='Wiadomość do technika'
													mb='sm'>
													{String(selected.technician_prompt)}
												</Alert>
											)}
											<CodeHighlight
												className='diagnostic-state-json'
												code={JSON.stringify(decision, null, 2)}
												language='json'
											/>
										</Paper>
									)
								})}
								{agentNextStepDecisions.length === 0 && (
									<Text size='sm' c='dimmed'>
										Best Next Step nie zwrócił żadnej decyzji.
									</Text>
								)}
							</Stack>

							<Alert color='blue' title='Wiadomość do technika' mt='md'>
								Dla kroków ask i observe agent wysyła zatwierdzone
								technician_prompt. Dla documented_test evaluator zwraca polskie
								tłumaczenie, a oryginalna instrukcja pozostaje w JSON-ie do
								weryfikacji.
							</Alert>
						</section>
					)}

					{selectedStage === 'simulation' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>10. Automatyczna symulacja technika</Title>
								<Badge variant='light' size='lg'>
									{agentSimulationSteps.length} kroków
								</Badge>
							</Group>
							<Stack gap='sm' mb='md'>
								{agentSimulationSteps.map((step, index) => (
									<Paper
										key={`${String(step.turn ?? index)}-${String(step.selected_fact_key)}`}
										withBorder
										p='sm'
										radius='sm'>
										<Group gap='xs' mb='xs'>
											<Badge>Krok {String(step.turn ?? index + 1)}</Badge>
											<Badge variant='outline'>
												{String(step.selected_fact_key ?? 'unknown fact')}
											</Badge>
											{step.canonical_fact_key !== step.selected_fact_key && (
												<Badge color='cyan' variant='light'>
													alias → {String(step.canonical_fact_key)}
												</Badge>
											)}
										</Group>
										<Text size='xs' c='dimmed'>
											Wiadomość wygenerowana przez Best Next Step
										</Text>
										<Text size='sm'>
											{String(step.technician_prompt ?? '—')}
										</Text>
										<Text size='xs' c='dimmed' mt='sm'>
											Automatyczna odpowiedź technika
										</Text>
										<Text size='sm' fw={600}>
											{String(step.technician_reply ?? '—')}
										</Text>
										<Text size='xs' c='dimmed' mt='xs'>
											Wstrzyknięta wartość: {JSON.stringify(step.fact_value)}
											{step.unit ? ` ${String(step.unit)}` : ''}
										</Text>
									</Paper>
								))}
								{agentSimulationSteps.length === 0 && (
									<Text size='sm' c='dimmed'>
										Best Next Step nie wymagał odpowiedzi technika.
									</Text>
								)}
							</Stack>
							<Paper withBorder p='md' radius='md'>
								<Text fw={600} mb='sm'>
									Final Diagnostic State po symulacji
								</Text>
								<CodeHighlight
									className='diagnostic-state-json'
									code={JSON.stringify(finalDiagnosticState ?? {}, null, 2)}
									language='json'
								/>
							</Paper>
						</section>
					)}

					{selectedStage === 'final' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>11. Final Diagnostic Answer</Title>
								<Badge color={finalAnswerCompleted ? 'green' : 'yellow'} size='lg'>
									{String(
										finalDiagnosticAnswer?.status ?? 'no result',
									).toUpperCase()}
								</Badge>
							</Group>
							<Alert
								color={finalAnswerCompleted ? 'green' : 'yellow'}
								title='Odpowiedź dla technika'
								mb='md'>
								<Text style={{ whiteSpace: 'pre-wrap' }}>
									{typeof finalDiagnosticAnswer?.text === 'string'
										? finalDiagnosticAnswer.text
										: 'Stan diagnostyczny nie pozwala jeszcze zbudować odpowiedzi.'}
								</Text>
							</Alert>
							<Paper withBorder p='md' radius='md'>
								<Text fw={600} mb='sm'>
									Dane użyte do odpowiedzi
								</Text>
								<CodeHighlight
									className='diagnostic-state-json'
									code={JSON.stringify(finalDiagnosticAnswer ?? {}, null, 2)}
									language='json'
								/>
							</Paper>
							<Alert color='blue' title='Zasada składania' mt='md'>
								Odpowiedź zawiera wyłącznie efekty, akcje i ograniczenia z
								zaakceptowanych reguł o statusie matched. Reguły częściowe i
								sprzeczne nie przekazują swoich akcji.
							</Alert>
						</section>
					)}

					{selectedStage === 'judge' && (
						<section>
							<Group justify='space-between' mb='sm'>
								<Title order={4}>12. Judge</Title>
								{typeof result.passed === 'boolean' && (
									<Badge color={result.passed ? 'green' : 'red'} size='lg'>
										{result.passed ? 'ZALICZONE' : 'NIEZALICZONE'}
									</Badge>
								)}
							</Group>
							{evaluationSkipped ? (
								<Alert color='yellow'>
									Ocena była wyłączona dla tego uruchomienia.
								</Alert>
							) : judge ? (
								<Stack gap='md'>
									<Group gap='xs'>
										{typeof result.score === 'number' && (
											<Badge variant='light'>score: {result.score}</Badge>
										)}
										{typeof result.judge_model === 'string' && (
											<Badge color='violet' variant='light'>
												{result.judge_model}
											</Badge>
										)}
										{typeof result.evidence_before_fix_passed === 'boolean' && (
											<Badge
												color={
													result.evidence_before_fix_passed
														? 'green'
														: 'red'
												}>
												Dowód przed naprawą:{' '}
												{result.evidence_before_fix_passed ? 'tak' : 'nie'}
											</Badge>
										)}
										{typeof result.primary_action_count === 'number' && (
											<Badge
												color={
													result.primary_action_limit_passed
														? 'green'
														: 'red'
												}>
												Główne naprawy: {result.primary_action_count}/
												{String(result.primary_action_minimum ?? 0)}–
												{String(result.primary_action_limit ?? '—')}
											</Badge>
										)}
									</Group>
									<SimpleGrid cols={{ base: 1, lg: 3 }} spacing='sm'>
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
											title='Niedozwolone twierdzenia'
											criteria={testCase.forbidden_claims}
											evaluations={forbiddenClaims}
											forbidden
										/>
									</SimpleGrid>
									{typeof judge.feedback === 'string' && judge.feedback && (
										<Alert color='blue' title='Komentarz judge’a'>
											{judge.feedback}
										</Alert>
									)}
								</Stack>
							) : (
								<Alert color='yellow'>Brak wyniku judge’a.</Alert>
							)}
						</section>
					)}
				</Stack>
			</Collapse>
		</Stack>
	)
}

const RETRIEVAL_TIMELINE_ORDER = [
	'translation',
	'embedding',
	'fetch_chunks',
	'exact_match',
	'semantic_search',
	'bm25',
	'fusion',
	'reranker',
	'initial_evidence_gate',
]

const RETRIEVAL_TIMELINE_COLORS: Record<string, string> = {
	translation: 'var(--mantine-color-cyan-filled)',
	embedding: 'var(--mantine-color-violet-filled)',
	fetch_chunks: 'var(--mantine-color-yellow-filled)',
	exact_match: 'var(--mantine-color-orange-filled)',
	semantic_search: 'var(--mantine-color-blue-filled)',
	bm25: 'var(--mantine-color-teal-filled)',
	fusion: 'var(--mantine-color-lime-filled)',
	reranker: 'var(--mantine-color-grape-filled)',
	initial_evidence_gate: 'var(--mantine-color-red-filled)',
}

const RESPONSE_TIMELINE_COLORS: Record<string, string> = {
	route: 'var(--mantine-color-indigo-filled)',
	retrieval: 'var(--mantine-color-blue-filled)',
	generation: 'var(--mantine-color-green-filled)',
	streaming: 'var(--mantine-color-teal-filled)',
	persistence: 'var(--mantine-color-violet-filled)',
	response_overhead: 'var(--mantine-color-gray-filled)',
}

function TimelineAxis({ duration, labelWidth }: { duration: number; labelWidth: string }) {
	const ticks = Array.from(
		{ length: Math.floor(duration / 1000) + 1 },
		(_, index) => index * 1000,
	)
	const lastTick = ticks.at(-1) ?? 0
	if (duration - lastTick >= 500) ticks.push(duration)

	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: `${labelWidth} 1fr`,
				gap: 12,
			}}>
			<div />
			<div
				style={{
					position: 'relative',
					height: 28,
					borderTop: '1px solid var(--mantine-color-default-border)',
				}}>
				{ticks.map((tick, index) => {
					const isFirst = index === 0
					const isLast = index === ticks.length - 1
					return (
						<div
							key={tick}
							style={{
								position: 'absolute',
								left: `${(tick / duration) * 100}%`,
								transform: isFirst
									? undefined
									: isLast && tick === duration
										? 'translateX(-100%)'
										: 'translateX(-50%)',
							}}>
							<div
								style={{
									width: 1,
									height: 5,
									background: 'var(--mantine-color-dimmed)',
									marginLeft:
										isLast && tick === duration ? '100%' : isFirst ? 0 : '50%',
								}}
							/>
							<Text size='xs' c='dimmed' style={{ whiteSpace: 'nowrap' }}>
								{Math.round(tick)} ms
							</Text>
						</div>
					)
				})}
			</div>
		</div>
	)
}

function ResponseTimeline({ result }: { result: ResultRecord }) {
	const timeline = asRecord(result.response_timeline)
	const items = asRecordArray(timeline?.items)
	const duration = typeof timeline?.duration_ms === 'number' ? timeline.duration_ms : 0
	if (items.length === 0 || duration <= 0) return null

	return (
		<Paper withBorder p='sm' radius='sm' mt='sm'>
			<Text fw={600} size='sm' mb='sm'>
				Oś czasu całej odpowiedzi
			</Text>
			<Stack gap={6}>
				{items.map((item) => {
					const start = typeof item.start_ms === 'number' ? item.start_ms : 0
					const end = typeof item.end_ms === 'number' ? item.end_ms : start
					const itemDuration = Math.max(0, end - start)
					const key = String(item.key ?? '')
					const turn = typeof item.turn === 'number' ? item.turn : 1
					return (
						<div
							key={`${turn}-${key}-${start}-${end}`}
							style={{
								display: 'grid',
								gridTemplateColumns: 'minmax(170px, 240px) 1fr',
								gap: 12,
								alignItems: 'center',
							}}>
							<Group justify='space-between' gap='xs' wrap='nowrap'>
								<Text size='xs' lineClamp={1}>
									{String(item.label ?? key)}
									{turn > 1 ? ` · odp. ${turn}` : ''}
								</Text>
								<Text size='xs' fw={700} style={{ whiteSpace: 'nowrap' }}>
									{formatDuration(itemDuration)}
								</Text>
							</Group>
							<div
								style={{
									position: 'relative',
									height: 18,
									background: 'var(--mantine-color-default-border)',
									borderRadius: 4,
								}}>
								<div
									style={{
										position: 'absolute',
										left: `${(start / duration) * 100}%`,
										width: `${(itemDuration / duration) * 100}%`,
										minWidth: 3,
										height: '100%',
										borderRadius: 4,
										background:
											RESPONSE_TIMELINE_COLORS[key] ??
											'var(--mantine-color-gray-filled)',
									}}
								/>
							</div>
						</div>
					)
				})}
				<TimelineAxis duration={duration} labelWidth='minmax(170px, 240px)' />
			</Stack>
			<Text size='xs' c='dimmed' mt='sm'>
				Obejmuje pełną odpowiedź i jej kontynuacje. Nie obejmuje oceny benchmarkowej.
			</Text>
		</Paper>
	)
}

function RetrievalTimeline({ result }: { result: ResultRecord }) {
	const timelines = asRecordArray(result.retrieval_timelines)
	if (timelines.length === 0) return null

	return (
		<Stack gap='md' mt='sm'>
			{timelines.map((timeline, timelineIndex) => {
				const items = asRecordArray(timeline.items).sort((a, b) => {
					if (timeline.layout === 'chronological') {
						return Number(a.start_ms ?? 0) - Number(b.start_ms ?? 0)
					}
					return (
						RETRIEVAL_TIMELINE_ORDER.indexOf(String(a.key)) -
						RETRIEVAL_TIMELINE_ORDER.indexOf(String(b.key))
					)
				})
				const measuredDuration =
					typeof timeline.duration_ms === 'number' ? timeline.duration_ms : 0
				const lastEnd = Math.max(
					0,
					...items.map((item) => (typeof item.end_ms === 'number' ? item.end_ms : 0)),
				)
				const axisDuration = Math.max(measuredDuration, lastEnd, 1)

				return (
					<div key={String(timeline.turn ?? timelineIndex)}>
						{(timelines.length > 1 || typeof timeline.label === 'string') && (
							<Text fw={600} size='sm' mb='xs'>
								{typeof timeline.label === 'string'
									? timeline.label
									: `Odpowiedź ${String(timeline.turn ?? timelineIndex + 1)}`}
							</Text>
						)}
						<Stack gap={6}>
							{items.map((item) => {
								const start = typeof item.start_ms === 'number' ? item.start_ms : 0
								const end = typeof item.end_ms === 'number' ? item.end_ms : start
								const duration = Math.max(0, end - start)
								const key = String(item.key ?? '')
								return (
									<div
										key={`${key}-${start}`}
										style={{
											display: 'grid',
											gridTemplateColumns: 'minmax(150px, 220px) 1fr',
											gap: 12,
											alignItems: 'center',
										}}>
										<Group justify='space-between' gap='xs' wrap='nowrap'>
											<Text size='xs' lineClamp={1}>
												{String(item.label ?? key)}
											</Text>
											<Text
												size='xs'
												fw={700}
												style={{ whiteSpace: 'nowrap' }}>
												{formatDuration(duration)}
											</Text>
										</Group>
										<div
											style={{
												position: 'relative',
												height: 18,
												background: 'var(--mantine-color-default-border)',
												borderRadius: 4,
											}}>
											<div
												style={{
													position: 'absolute',
													left: `${(start / axisDuration) * 100}%`,
													width: `${(duration / axisDuration) * 100}%`,
													minWidth: 3,
													height: '100%',
													borderRadius: 4,
													background:
														RETRIEVAL_TIMELINE_COLORS[key] ??
														'var(--mantine-color-blue-filled)',
												}}
											/>
										</div>
									</div>
								)
							})}
							<TimelineAxis
								duration={axisDuration}
								labelWidth='minmax(150px, 220px)'
							/>
						</Stack>
					</div>
				)
			})}
		</Stack>
	)
}

function StandardPipelineTimings({ result, opened }: { result: ResultRecord; opened: boolean }) {
	const stageTimings = asRecord(result.stage_timings_ms)
	const hasRetrievalTimeline = asRecordArray(result.retrieval_timelines).length > 0
	if (!stageTimings) return null

	return (
		<Collapse expanded={opened}>
			<Paper withBorder p='md' radius='md' mt='sm'>
				<ResponseTimeline result={result} />
				{hasRetrievalTimeline && (
					<Paper withBorder p='sm' radius='sm' mt='sm'>
						<Text fw={600} size='sm'>
							Oś czasu Retrieval + Reranker
						</Text>
						<RetrievalTimeline result={result} />
						<Text size='xs' c='dimmed' mt='sm'>
							Tłumaczenie, embedding i pobranie chunków startują równolegle.
							Wyszukiwanie rusza po ich zakończeniu, a reranker po zbudowaniu puli
							kandydatów.
						</Text>
					</Paper>
				)}
			</Paper>
		</Collapse>
	)
}

type StandardResultStage = 'answer' | 'retrieval' | 'evaluation'

const STANDARD_RESULT_STAGES: Array<{
	value: StandardResultStage
	label: string
	description: string
}> = [
	{ value: 'answer', label: 'Odpowiedź', description: 'Treść odpowiedzi' },
	{ value: 'retrieval', label: 'Retrieval', description: 'Chunki i reranker' },
	{ value: 'evaluation', label: 'Ocena', description: 'Wynik judge' },
]

function CaseRunResult({
	runId,
	testCase,
	timingsOpened,
}: {
	runId: string
	testCase: BenchmarkCase
	timingsOpened: boolean
}) {
	const { data: run } = useCaseRun(runId)
	const cancelRun = useCancelCaseRun()
	const [selectedStandardStage, setSelectedStandardStage] = useState<StandardResultStage | null>(
		null,
	)

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
	const evaluationSkipped = result.evaluation_skipped === true
	const isActive = run.state === 'queued' || run.state === 'processing'
	const isAgentPipeline = result.mode === 'agent'

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
			{run.result && isAgentPipeline && (
				<AgentPipelineResult result={result} testCase={testCase} />
			)}
			{run.result && !isAgentPipeline && (
				<>
					<StandardPipelineTimings result={result} opened={timingsOpened} />
					<Paper withBorder p='md' radius='md'>
						<Text size='xs' fw={700} tt='uppercase' c='dimmed' mb='sm'>
							Przebieg benchmarku — wybierz etap
						</Text>
						<Group gap='xs' wrap='nowrap' style={{ overflowX: 'auto' }} pb={4}>
							{STANDARD_RESULT_STAGES.map((stage, index) => (
								<Group key={stage.value} gap='xs' wrap='nowrap'>
									{index > 0 && (
										<Text size='xl' c='dimmed' aria-hidden>
											→
										</Text>
									)}
									<Button
										variant={
											selectedStandardStage === stage.value
												? 'filled'
												: 'default'
										}
										h='auto'
										py='sm'
										px='lg'
										radius='md'
										style={{ minWidth: 180 }}
										aria-pressed={selectedStandardStage === stage.value}
										onClick={() =>
											setSelectedStandardStage((current) =>
												current === stage.value ? null : stage.value,
											)
										}>
										<Stack gap={1} align='center'>
											<Text size='sm' fw={600} c='inherit'>
												{index + 1}. {stage.label}
											</Text>
											<Text
												size='xs'
												c={
													selectedStandardStage === stage.value
														? 'inherit'
														: 'dimmed'
												}>
												{stage.description}
											</Text>
										</Stack>
									</Button>
								</Group>
							))}
						</Group>
					</Paper>

					<Collapse expanded={selectedStandardStage !== null}>
						{selectedStandardStage === 'answer' && (
							<Paper withBorder p='md' radius='md'>
								<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
									{answer || 'Model nie zwrócił odpowiedzi.'}
								</Text>
							</Paper>
						)}

						{selectedStandardStage === 'retrieval' && (
							<SimpleGrid cols={{ base: 1, xl: 2 }} spacing='md'>
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
						)}

						{selectedStandardStage === 'evaluation' &&
							(evaluationSkipped ? (
								<Alert color='gray' variant='light'>
									Ocenianie zostało wyłączone dla tego uruchomienia.
								</Alert>
							) : (
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
							))}
					</Collapse>
				</>
			)}
		</Stack>
	)
}

interface CaseItemProps {
	testCase: BenchmarkCase
	runId: string | null
	evaluationEnabled: boolean
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

function CaseItem({ testCase, runId, evaluationEnabled, onRunStarted }: CaseItemProps) {
	const startRun = useStartCaseRun()
	const { data: caseRun } = useCaseRun(runId)
	const clipboard = useClipboard({ timeout: 2000 })
	const [caseContentOpened, { toggle: toggleCaseContent }] = useDisclosure(false)
	const [timingsOpened, { toggle: toggleTimings, close: closeTimings }] = useDisclosure(false)
	const caseRunResult = caseRun?.result ?? {}
	const caseRunStageTimings = asRecord(caseRunResult.stage_timings_ms)
	const responseTotal =
		caseRunStageTimings?.conversation_total !== undefined
			? formatDuration(caseRunStageTimings.conversation_total)
			: null

	function handleRun() {
		closeTimings()
		startRun.mutate(
			{ caseId: testCase.id, evaluate: evaluationEnabled },
			{
				onSuccess: (run) => onRunStarted(testCase.id, run.id),
			},
		)
	}

	return (
		<Card withBorder>
			<Group justify='space-between' align='flex-start'>
				<Title order={4}>{testCase.title}</Title>
				<Group gap='xs'>
					<Button
						size='xs'
						variant='default'
						color={clipboard.copied ? 'green' : undefined}
						leftSection={
							clipboard.copied ? <IconCheck size={14} /> : <IconCopy size={14} />
						}
						onClick={() =>
							clipboard.copy(
								formatBenchmarkCaseForClipboard(testCase, caseRun ?? null),
							)
						}>
						{clipboard.copied ? 'Skopiowano' : 'Kopiuj cały case'}
					</Button>
					<Button size='xs' loading={startRun.isPending} onClick={handleRun}>
						Uruchom
					</Button>
				</Group>
			</Group>

			<Group gap='xs' mt='lg'>
				<Button
					size='compact-sm'
					variant={caseContentOpened ? 'light' : 'default'}
					onClick={toggleCaseContent}
					aria-expanded={caseContentOpened}>
					Treść case’a{' '}
					{caseContentOpened ? (
						<IconChevronUp size={14} />
					) : (
						<IconChevronDown size={14} />
					)}
				</Button>
				{testCase.mode === 'standard' && (
					<Button
						size='compact-sm'
						variant={timingsOpened ? 'light' : 'default'}
						onClick={toggleTimings}
						aria-expanded={timingsOpened}
						disabled={!runId}>
						Czasy etapów{responseTotal ? ` · ${responseTotal}` : ''}{' '}
						{timingsOpened ? (
							<IconChevronUp size={14} />
						) : (
							<IconChevronDown size={14} />
						)}
					</Button>
				)}
			</Group>

			<Collapse expanded={caseContentOpened}>
				<Stack gap='md' mt='md'>
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
						<Stack gap='md'>
							<Alert color='cyan' variant='light' title='Zakres uruchomienia agenta'>
								Pełny przebieg od Case Context przez diagnostykę i symulowane
								odpowiedzi technika do Final Answer oraz końcowego Judge’a.
							</Alert>
							{testCase.agent_goal && (
								<Alert color='blue' variant='light' title='Cel zakończenia'>
									<Text size='sm'>{testCase.agent_goal.terminal_goal}</Text>
									<Text size='xs' mt='xs'>
										Wymagane dowody przed naprawą:{' '}
										{testCase.agent_goal.required_evidence_fact_keys.join(
											', ',
										) || 'brak'}
										· wymagane działania główne:{' '}
										{testCase.agent_goal.min_primary_actions}–
										{testCase.agent_goal.max_primary_actions}
									</Text>
								</Alert>
							)}
							<div>
								<Text size='xs' fw={700} tt='uppercase' c='dimmed' mb={6}>
									Założenia case’u
								</Text>
								<Stack gap='xs'>
									{testCase.assumptions.map((assumption) => (
										<Paper key={assumption.key} withBorder p='sm' radius='md'>
											<Group justify='space-between' align='flex-start'>
												<Text size='sm' fw={600}>
													{assumption.statement}
												</Text>
												<Badge variant='light'>
													s. {assumption.source_page}
												</Badge>
											</Group>
											<Text size='xs' c='dimmed' mt={4}>
												{assumption.key} · {assumption.source_locator}
											</Text>
										</Paper>
									))}
								</Stack>
							</div>
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
						</Stack>
					)}
				</Stack>
			</Collapse>
			{runId && (
				<CaseRunResult runId={runId} testCase={testCase} timingsOpened={timingsOpened} />
			)}
		</Card>
	)
}

function CasesSection() {
	const { data, isLoading } = useBenchmarkCases()
	const [selectedMode, setSelectedMode] = useState<'standard' | 'agent'>('standard')
	const [evaluationEnabled, setEvaluationEnabled] = useState(true)
	const [agentJudgeEnabled, setAgentJudgeEnabled] = useState(false)
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
						{selectedMode === 'standard' && (
							<Switch
								mt='sm'
								checked={evaluationEnabled}
								onChange={(event) =>
									setEvaluationEnabled(event.currentTarget.checked)
								}
								label='Oceniaj odpowiedź'
								description='Wyłącz, aby pominąć ocenę odpowiedzi i chunków przez judge.'
							/>
						)}
						{selectedMode === 'agent' && (
							<Switch
								mt='sm'
								checked={agentJudgeEnabled}
								onChange={(event) =>
									setAgentJudgeEnabled(event.currentTarget.checked)
								}
								label='Uruchom Judge na końcu'
								description='Domyślnie wyłączony. Włącz, aby po Final Answer ocenić odpowiedź i chunki.'
							/>
						)}
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
							key={selectedCase.id}
							testCase={selectedCase}
							runId={runIds[selectedCase.id] ?? null}
							evaluationEnabled={
								selectedMode === 'standard' ? evaluationEnabled : agentJudgeEnabled
							}
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
			<SetupSection />
			<CasesSection />
		</Stack>
	)
}
