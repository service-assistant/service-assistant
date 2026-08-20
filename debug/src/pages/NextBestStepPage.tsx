import { CodeHighlight } from '@mantine/code-highlight'
import {
	Accordion,
	Alert,
	Badge,
	Button,
	Card,
	Group,
	List,
	Paper,
	Select,
	Stack,
	Table,
	Tabs,
	Text,
	Textarea,
	Title,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { useDevices } from '@/hooks/useDevices'
import { useCreateThread } from '@/hooks/useNextBestStep'
import { API_URL } from '@/lib/api'
import {
	computeNbsScore,
	nbsActions,
	nbsAlgorithmSteps,
	nbsFlowSteps,
	nbsScenarios,
} from '@/lib/nextBestStepData'
import { parseSseBuffer, parseSseData } from '@/lib/sse'
import type { MessageRead } from '@/lib/types'

interface DebugTraceEvent {
	step: string
	label: string
	duration_ms: number
	data: unknown
}

interface DebugTraceEntry extends DebugTraceEvent {
	id: string
}

function AlgorithmWalkthrough() {
	return (
		<Tabs defaultValue='steps'>
			<Tabs.List>
				<Tabs.Tab value='steps'>Kroki algorytmu</Tabs.Tab>
				<Tabs.Tab value='ranking'>Ranking akcji</Tabs.Tab>
				<Tabs.Tab value='scenarios'>Scenariusze</Tabs.Tab>
				<Tabs.Tab value='tree'>Drzewo decyzji</Tabs.Tab>
			</Tabs.List>

			<Tabs.Panel value='steps' pt='sm'>
				<Accordion variant='separated'>
					{nbsAlgorithmSteps.map((step, index) => (
						<Accordion.Item key={step.title} value={String(index)}>
							<Accordion.Control>
								<Group justify='space-between' pr='md'>
									<Text fw={500}>{step.title}</Text>
									<Badge
										color={
											step.mode === 'llm'
												? 'grape'
												: step.mode === 'hybrid'
													? 'yellow'
													: 'red'
										}>
										{step.modeLabel}
									</Badge>
								</Group>
								<Text size='xs' c='dimmed'>
									{step.owner}
								</Text>
							</Accordion.Control>
							<Accordion.Panel>
								<Stack gap='sm'>
									<Text size='sm'>{step.rule}</Text>
									<Text size='sm' fs='italic' c='dimmed'>
										{step.boundary}
									</Text>
									<Text size='xs' fw={600}>
										{step.inputLabel}
									</Text>
									<CodeHighlight code={step.input} language='json' />
									<Text size='xs' fw={600}>
										{step.outputLabel}
									</Text>
									<CodeHighlight code={step.output} language='json' />
								</Stack>
							</Accordion.Panel>
						</Accordion.Item>
					))}
				</Accordion>
			</Tabs.Panel>

			<Tabs.Panel value='ranking' pt='sm'>
				<Text size='sm' c='dimmed' mb='sm'>
					Przykładowe akcje dla błędu 2:002, posortowane wg score = benefit − burden.
				</Text>
				<Table>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>Akcja</Table.Th>
							<Table.Th>Score</Table.Th>
							<Table.Th>Info</Table.Th>
							<Table.Th>Rozwiązanie</Table.Th>
							<Table.Th>Wysiłek</Table.Th>
							<Table.Th>Inwazyjność</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{[...nbsActions]
							.sort((a, b) => computeNbsScore(b) - computeNbsScore(a))
							.map((action) => (
								<Table.Tr key={action.id}>
									<Table.Td>{action.title}</Table.Td>
									<Table.Td>
										<Badge variant='light'>
											{computeNbsScore(action).toFixed(3)}
										</Badge>
									</Table.Td>
									<Table.Td>{action.info}</Table.Td>
									<Table.Td>{action.resolution}</Table.Td>
									<Table.Td>{action.effort}</Table.Td>
									<Table.Td>{action.invasive}</Table.Td>
								</Table.Tr>
							))}
					</Table.Tbody>
				</Table>
			</Tabs.Panel>

			<Tabs.Panel value='scenarios' pt='sm'>
				<Accordion variant='separated'>
					{nbsScenarios.map((scenario) => (
						<Accordion.Item key={scenario.key} value={scenario.key}>
							<Accordion.Control>
								<Text fw={500}>{scenario.label}</Text>
								<Text size='xs' c='dimmed'>
									{scenario.observation}
								</Text>
							</Accordion.Control>
							<Accordion.Panel>
								<Stack gap='xs'>
									<Group gap='xs'>
										<Text size='xs' fw={600}>
											Dopuszczone:
										</Text>
										{scenario.eligible.length > 0 ? (
											scenario.eligible.map((id) => (
												<Badge key={id} size='xs' color='green'>
													{id}
												</Badge>
											))
										) : (
											<Text size='xs' c='dimmed'>
												brak
											</Text>
										)}
									</Group>
									<Group gap='xs'>
										<Text size='xs' fw={600}>
											Odrzucone:
										</Text>
										{scenario.rejected.length > 0 ? (
											scenario.rejected.map((id) => (
												<Badge key={id} size='xs' color='red'>
													{id}
												</Badge>
											))
										) : (
											<Text size='xs' c='dimmed'>
												brak
											</Text>
										)}
									</Group>
									{scenario.pendingDecision && (
										<Alert color='yellow' variant='light'>
											{scenario.pendingDecision}
										</Alert>
									)}
									<div
										// biome-ignore lint/security/noDangerouslySetInnerHtml: static hardcoded reference content, not user input
										dangerouslySetInnerHTML={{ __html: scenario.messageHtml }}
									/>
								</Stack>
							</Accordion.Panel>
						</Accordion.Item>
					))}
				</Accordion>
			</Tabs.Panel>

			<Tabs.Panel value='tree' pt='sm'>
				<Stack gap='sm'>
					{nbsFlowSteps.map((step) => (
						<Card key={step.key} withBorder>
							<Badge size='xs' mb={4}>
								{step.badge}
							</Badge>
							<Text fw={500}>{step.title}</Text>
							{step.action && (
								<Text size='sm' mt={4}>
									{step.action}
								</Text>
							)}
							{step.question && (
								<Text size='sm' c='dimmed' mt={4}>
									{step.question}
								</Text>
							)}
							{step.choices && (
								<List size='sm' mt='xs'>
									{step.choices.map((choice) => (
										<List.Item key={choice.label}>
											{choice.label} →{' '}
											<Text span c='dimmed'>
												{choice.next}
											</Text>
										</List.Item>
									))}
								</List>
							)}
							{step.terminal && (
								<Text size='sm' mt={4} c='dimmed'>
									{step.terminal}
								</Text>
							)}
						</Card>
					))}
				</Stack>
			</Tabs.Panel>
		</Tabs>
	)
}

function DebugTraceList({ events }: { events: DebugTraceEntry[] }) {
	if (events.length === 0) return null
	return (
		<Accordion variant='separated'>
			{events.map((event) => (
				<Accordion.Item key={event.id} value={event.id}>
					<Accordion.Control>
						<Group justify='space-between' pr='md'>
							<Text size='sm' fw={500}>
								{event.label}
							</Text>
							<Badge variant='light' size='xs'>
								{event.duration_ms} ms
							</Badge>
						</Group>
					</Accordion.Control>
					<Accordion.Panel>
						<CodeHighlight code={JSON.stringify(event.data, null, 2)} language='json' />
					</Accordion.Panel>
				</Accordion.Item>
			))}
		</Accordion>
	)
}

function DebugChatPanel({ deviceId }: { deviceId: number | null }) {
	const createThread = useCreateThread()
	const [threadId, setThreadId] = useState<number | null>(null)
	const [question, setQuestion] = useState('')
	const [sending, setSending] = useState(false)
	const [routeDecision, setRouteDecision] = useState<string | null>(null)
	const [answer, setAnswer] = useState('')
	const [debugEvents, setDebugEvents] = useState<DebugTraceEntry[]>([])
	const [error, setError] = useState<string | null>(null)

	function startThread() {
		if (deviceId === null) return
		createThread.mutate(
			{
				device_id: deviceId,
				title: `Next Best Step debug — ${new Date().toLocaleString('pl-PL')}`,
			},
			{ onSuccess: (thread) => setThreadId(thread.id) },
		)
	}

	async function sendMessage() {
		if (threadId === null || !question.trim() || sending) return
		setSending(true)
		setError(null)
		setAnswer('')
		setDebugEvents([])
		setRouteDecision(null)

		try {
			const response = await fetch(
				`${API_URL}/api/admin/next-best-step/threads/${threadId}/messages`,
				{
					method: 'POST',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json', 'X-Auth-Scope': 'admin' },
					body: JSON.stringify({ content: question, diagnostic_mode_enabled: true }),
				},
			)

			if (!response.ok || !response.body) {
				throw new Error(`Błąd serwera: ${response.status}`)
			}

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let streamedAnswer = ''

			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				const { events, rest } = parseSseBuffer(buffer)
				buffer = rest

				for (const evt of events) {
					if (evt.event === 'debug') {
						const payload = parseSseData<DebugTraceEvent>(evt.data)
						if (typeof payload === 'object') {
							setDebugEvents((prev) => [
								...prev,
								{ ...payload, id: crypto.randomUUID() },
							])
						}
					} else if (evt.event === 'route') {
						setRouteDecision(evt.data)
					} else if (evt.event === 'chunk') {
						streamedAnswer += evt.data
						setAnswer(streamedAnswer)
					} else if (evt.event === 'message') {
						const payload = parseSseData<MessageRead>(evt.data)
						if (typeof payload === 'object') {
							setAnswer(payload.content)
						}
					}
				}
			}

			setQuestion('')
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Błąd komunikacji.')
		} finally {
			setSending(false)
		}
	}

	return (
		<Card withBorder>
			<Title order={4} mb='sm'>
				Czat debug
			</Title>

			{threadId === null ? (
				<Button
					disabled={deviceId === null}
					loading={createThread.isPending}
					onClick={startThread}>
					Rozpocznij wątek debug
				</Button>
			) : (
				<Stack gap='sm'>
					<Text size='xs' c='dimmed'>
						Wątek #{threadId}
					</Text>
					<Group align='flex-end'>
						<Textarea
							flex={1}
							placeholder='Wpisz pytanie…'
							value={question}
							onChange={(e) => setQuestion(e.currentTarget.value)}
							autosize
							minRows={1}
						/>
						<Button
							loading={sending}
							disabled={!question.trim()}
							onClick={() => void sendMessage()}>
							Wyślij
						</Button>
					</Group>

					{error && <Alert color='red'>{error}</Alert>}

					{routeDecision && (
						<Badge variant='light' w='fit-content'>
							route: {routeDecision}
						</Badge>
					)}

					{answer && (
						<Paper withBorder p='sm'>
							<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
								{answer}
							</Text>
						</Paper>
					)}

					<Title order={6}>Ślad debugowania</Title>
					<DebugTraceList events={debugEvents} />
				</Stack>
			)}
		</Card>
	)
}

export function NextBestStepPage() {
	const { data: devices } = useDevices()
	const [deviceId, setDeviceId] = useState<number | null>(null)

	const deviceOptions = useMemo(
		() => (devices ?? []).map((d) => ({ value: String(d.id), label: d.name })),
		[devices],
	)

	return (
		<Stack gap='md'>
			<Title order={2}>Next Best Step</Title>

			<Alert color='blue' variant='light'>
				Działa wyłącznie na danych organizacji „system" — nie na danych rzeczywistych
				klientów.
			</Alert>

			<Select
				label='Urządzenie'
				placeholder='Wybierz urządzenie'
				data={deviceOptions}
				value={deviceId !== null ? String(deviceId) : null}
				onChange={(value) => setDeviceId(value ? Number(value) : null)}
				searchable
				clearable
				w={360}
			/>

			<AlgorithmWalkthrough />

			<DebugChatPanel deviceId={deviceId} />
		</Stack>
	)
}
