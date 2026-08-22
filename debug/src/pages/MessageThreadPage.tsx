import {
	ActionIcon,
	Alert,
	Badge,
	Box,
	Button,
	Center,
	Code,
	Group,
	Loader,
	Paper,
	ScrollArea,
	Stack,
	Text,
	Textarea,
	Title,
} from '@mantine/core'
import {
	IconArrowLeft,
	IconChevronRight,
	IconFileText,
	IconPhoto,
	IconRobot,
	IconSend,
	IconUser,
	IconX,
	IconZoomIn,
} from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthenticatedAsset } from '@/hooks/useAuthenticatedAsset'
import { useChunkFile } from '@/hooks/useChunks'
import { useMessageThread, useThreadMessages } from '@/hooks/useMessages'
import { API_URL } from '@/lib/api'
import { parseSseBuffer, parseSseData } from '@/lib/sse'
import type { DebugMessageChunkRead, MessageRead } from '@/lib/types'

function formatTime(value: string): string {
	return new Date(value).toLocaleString('pl-PL')
}

type EvidenceImage = {
	attachmentId: number
	attachmentName: string
	filename: string
}

type EvidenceSource = {
	attachmentId: number
	attachmentName: string
	pageNumber: number
}

type EvidencePreview =
	| { kind: 'source'; source: EvidenceSource }
	| { kind: 'image'; image: EvidenceImage }
	| { kind: 'chunks'; chunks: DebugMessageChunkRead[] }

function EvidenceThumbnail({ image, onExpand }: { image: EvidenceImage; onExpand: () => void }) {
	const path = `/api/admin/chunks/files/${image.attachmentId}/images/${encodeURIComponent(image.filename)}`
	const { error, url } = useAuthenticatedAsset(path)
	return (
		<button
			type='button'
			disabled={!url}
			onClick={onExpand}
			title={`${image.attachmentName}: ${image.filename}`}
			style={{
				position: 'relative',
				width: 104,
				height: 78,
				padding: 0,
				overflow: 'hidden',
				border: '1px solid var(--mantine-color-default-border)',
				borderRadius: 'var(--mantine-radius-sm)',
				background: 'var(--mantine-color-default)',
				cursor: url ? 'zoom-in' : 'default',
			}}>
			{!url && !error && <Loader size='xs' />}
			{error && <IconPhoto size={20} />}
			{url && (
				<>
					<img
						src={url}
						alt={image.filename}
						style={{ width: '100%', height: '100%', objectFit: 'cover' }}
					/>
					<IconZoomIn
						color='white'
						size={17}
						style={{
							position: 'absolute',
							right: 5,
							bottom: 5,
							filter: 'drop-shadow(0 1px 3px black)',
						}}
					/>
				</>
			)}
		</button>
	)
}

function AnswerEvidence({
	chunks,
	onExpandImage,
	onOpenChunks,
	onOpenSource,
}: {
	chunks: DebugMessageChunkRead[]
	onExpandImage: (image: EvidenceImage) => void
	onOpenChunks: (chunks: DebugMessageChunkRead[]) => void
	onOpenSource: (source: EvidenceSource) => void
}) {
	const sources = useMemo(() => {
		const unique = new Map<string, DebugMessageChunkRead>()
		for (const chunk of chunks) {
			const page = chunk.metadata?.page ?? -1
			unique.set(`${chunk.attachment_id}:${page}`, chunk)
		}
		return Array.from(unique.values())
	}, [chunks])
	const images = useMemo(() => {
		const unique = new Map<string, EvidenceImage>()
		for (const chunk of chunks) {
			for (const filename of chunk.metadata?.images ?? []) {
				const image = {
					attachmentId: chunk.attachment_id,
					attachmentName: chunk.attachment_name,
					filename,
				}
				unique.set(`${image.attachmentId}:${filename}`, image)
			}
		}
		return Array.from(unique.values())
	}, [chunks])

	if (chunks.length === 0) {
		return (
			<Text size='xs' c='dimmed' mt='sm'>
				Brak przypisanych źródeł i chunków.
			</Text>
		)
	}

	return (
		<Stack gap='xs' mt='md'>
			<div>
				<Text size='xs' fw={700} c='dimmed' mb={5}>
					ŹRÓDŁA ({sources.length})
				</Text>
				<Group gap={6}>
					{sources.map((source) => {
						const pageNumber = (source.metadata?.page ?? 0) + 1
						return (
							<Button
								key={`${source.attachment_id}:${pageNumber}`}
								variant='light'
								size='compact-sm'
								leftSection={<IconFileText size={14} />}
								rightSection={<IconChevronRight size={14} />}
								onClick={() =>
									onOpenSource({
										attachmentId: source.attachment_id,
										attachmentName: source.attachment_name,
										pageNumber,
									})
								}>
								{source.attachment_name} · str. {pageNumber}
							</Button>
						)
					})}
				</Group>
			</div>

			{images.length > 0 && (
				<div>
					<Text size='xs' fw={700} c='dimmed' mb={5}>
						WYBRANE SCHEMATY ({images.length})
					</Text>
					<Group gap='xs'>
						{images.map((image) => (
							<EvidenceThumbnail
								key={`${image.attachmentId}:${image.filename}`}
								image={image}
								onExpand={() => onExpandImage(image)}
							/>
						))}
					</Group>
				</div>
			)}

			<Button
				variant='default'
				size='compact-sm'
				rightSection={<IconChevronRight size={14} />}
				onClick={() => onOpenChunks(chunks)}>
				Pokaż chunki ({chunks.length})
			</Button>
		</Stack>
	)
}

function ChatBubble({
	content,
	createdAt,
	chunks,
	onExpandImage,
	onOpenChunks,
	onOpenSource,
	sender,
}: {
	content: string
	createdAt?: string
	chunks?: DebugMessageChunkRead[]
	onExpandImage?: (image: EvidenceImage) => void
	onOpenChunks?: (chunks: DebugMessageChunkRead[]) => void
	onOpenSource?: (source: EvidenceSource) => void
	sender: 'user' | 'assistant'
}) {
	const user = sender === 'user'
	return (
		<Group justify={user ? 'flex-end' : 'flex-start'} align='flex-start' wrap='nowrap'>
			{!user && (
				<Center
					w={34}
					h={34}
					style={{ borderRadius: 20, background: 'var(--mantine-color-blue-light)' }}>
					<IconRobot size={18} />
				</Center>
			)}
			<Paper
				withBorder={!user}
				p='sm'
				radius='md'
				bg={user ? 'blue.7' : undefined}
				style={{ maxWidth: '78%' }}>
				<Text size='sm' c={user ? 'white' : undefined} style={{ whiteSpace: 'pre-wrap' }}>
					{content}
				</Text>
				{!user && chunks && onExpandImage && onOpenChunks && onOpenSource && (
					<AnswerEvidence
						chunks={chunks}
						onExpandImage={onExpandImage}
						onOpenChunks={onOpenChunks}
						onOpenSource={onOpenSource}
					/>
				)}
				{createdAt && (
					<Text size='xs' c={user ? 'blue.1' : 'dimmed'} mt={6} ta='right'>
						{formatTime(createdAt)}
					</Text>
				)}
			</Paper>
			{user && (
				<Center
					w={34}
					h={34}
					style={{ borderRadius: 20, background: 'var(--mantine-color-blue-filled)' }}>
					<IconUser color='white' size={18} />
				</Center>
			)}
		</Group>
	)
}

export function MessageThreadPage() {
	const { threadId } = useParams({ strict: false }) as { threadId: string }
	const id = Number(threadId)
	const queryClient = useQueryClient()
	const { data: thread, isLoading: threadLoading } = useMessageThread(id)
	const { data: messages, isLoading: messagesLoading, refetch } = useThreadMessages(id)
	const [question, setQuestion] = useState('')
	const [pendingQuestion, setPendingQuestion] = useState<string>()
	const [streamedAnswer, setStreamedAnswer] = useState('')
	const [route, setRoute] = useState<string>()
	const [sending, setSending] = useState(false)
	const [error, setError] = useState<string>()
	const [evidencePreview, setEvidencePreview] = useState<EvidencePreview>()
	const [chunksBeforePdf, setChunksBeforePdf] = useState<DebugMessageChunkRead[]>()
	const endRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: 'end' })
	})

	async function sendMessage() {
		const content = question.trim()
		if (!content || sending) return
		setQuestion('')
		setPendingQuestion(content)
		setStreamedAnswer('')
		setRoute(undefined)
		setError(undefined)
		setSending(true)

		try {
			const response = await fetch(`${API_URL}/api/admin/messages/threads/${id}/messages`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json', 'X-Auth-Scope': 'admin' },
				body: JSON.stringify({ content, diagnostic_mode_enabled: false }),
			})
			if (!response.ok || !response.body) throw new Error(`Błąd serwera: ${response.status}`)

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let answer = ''
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				const parsed = parseSseBuffer(buffer)
				buffer = parsed.rest
				for (const event of parsed.events) {
					if (event.event === 'route') setRoute(event.data)
					if (event.event === 'chunk') {
						answer += event.data
						setStreamedAnswer(answer)
					}
					if (event.event === 'message') {
						const message = parseSseData<MessageRead>(event.data)
						if (typeof message === 'object') setStreamedAnswer(message.content)
					}
				}
			}
		} catch (sendError) {
			setError(
				sendError instanceof Error ? sendError.message : 'Nie udało się wysłać wiadomości.',
			)
		} finally {
			await refetch()
			await queryClient.invalidateQueries({ queryKey: ['debug-messages', 'threads'] })
			setPendingQuestion(undefined)
			setStreamedAnswer('')
			setSending(false)
		}
	}

	if (threadLoading)
		return (
			<Center h='60vh'>
				<Loader />
			</Center>
		)
	if (!thread) return <Alert color='red'>Nie znaleziono threada.</Alert>

	return (
		<Stack gap='md' h='calc(100vh - 32px)'>
			<Group justify='space-between' wrap='nowrap'>
				<Group wrap='nowrap'>
					<ActionIcon
						component={Link}
						to='/messages'
						variant='default'
						size='lg'
						aria-label='Wróć'>
						<IconArrowLeft size={18} />
					</ActionIcon>
					<div>
						<Title order={3}>{thread.title}</Title>
						<Text size='sm' c='dimmed'>
							{thread.organization_name} · {thread.device_name} · thread #{thread.id}
						</Text>
					</div>
				</Group>
				<Group>
					{route && <Badge variant='light'>route: {route}</Badge>}
					<Badge variant='outline'>
						{messages?.length ?? thread.message_count} wiadomości
					</Badge>
				</Group>
			</Group>

			<Box
				style={{
					display: 'grid',
					gridTemplateColumns: evidencePreview
						? 'minmax(0, 1fr) minmax(420px, 48%)'
						: 'minmax(0, 1fr)',
					gap: 16,
					flex: 1,
					minHeight: 0,
				}}>
				<Stack gap='md' style={{ minHeight: 0 }}>
					<Paper
						withBorder
						radius='md'
						style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
						<ScrollArea h='100%'>
							<Stack p='lg' gap='md'>
								{messagesLoading && (
									<Center py='xl'>
										<Loader />
									</Center>
								)}
								{!messagesLoading &&
									(messages ?? []).length === 0 &&
									!pendingQuestion && (
										<Center py='xl'>
											<Stack align='center' gap='xs'>
												<IconRobot size={36} />
												<Text c='dimmed'>
													To nowy thread. Zadaj pierwsze pytanie.
												</Text>
											</Stack>
										</Center>
									)}
								{(messages ?? []).map((message) => (
									<ChatBubble
										key={message.id}
										content={message.content}
										createdAt={message.created_at}
										chunks={message.chunks}
										onExpandImage={(image) => {
											setChunksBeforePdf(undefined)
											setEvidencePreview({ kind: 'image', image })
										}}
										onOpenChunks={(chunks) => {
											setChunksBeforePdf(undefined)
											setEvidencePreview({ kind: 'chunks', chunks })
										}}
										onOpenSource={(source) => {
											setChunksBeforePdf(undefined)
											setEvidencePreview({ kind: 'source', source })
										}}
										sender={message.sender}
									/>
								))}
								{pendingQuestion && (
									<ChatBubble content={pendingQuestion} sender='user' />
								)}
								{sending && (
									<ChatBubble
										content={
											streamedAnswer || 'Asystent przygotowuje odpowiedź…'
										}
										sender='assistant'
									/>
								)}
								<div ref={endRef} />
							</Stack>
						</ScrollArea>
					</Paper>

					{error && <Alert color='red'>{error}</Alert>}
					<Paper withBorder radius='md' p='sm'>
						<Group align='flex-end' wrap='nowrap'>
							<Textarea
								flex={1}
								placeholder='Wpisz kolejne pytanie…'
								value={question}
								onChange={(event) => setQuestion(event.currentTarget.value)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' && !event.shiftKey) {
										event.preventDefault()
										void sendMessage()
									}
								}}
								autosize
								minRows={2}
								maxRows={6}
								disabled={sending}
							/>
							<Button
								h={54}
								leftSection={<IconSend size={17} />}
								loading={sending}
								disabled={!question.trim()}
								onClick={() => void sendMessage()}>
								Wyślij
							</Button>
						</Group>
					</Paper>
				</Stack>

				{evidencePreview && (
					<Paper withBorder radius='md' style={{ minHeight: 0, overflow: 'hidden' }}>
						<Stack h='100%' gap={0}>
							<Group justify='space-between' wrap='nowrap' p='sm'>
								<Text fw={700} size='sm' lineClamp={1}>
									{evidencePreview.kind === 'source'
										? `${evidencePreview.source.attachmentName} · strona ${evidencePreview.source.pageNumber}`
										: evidencePreview.kind === 'image'
											? `${evidencePreview.image.attachmentName}: ${evidencePreview.image.filename}`
											: `Chunki użyte w odpowiedzi (${evidencePreview.chunks.length})`}
								</Text>
								<Group gap='xs' wrap='nowrap'>
									{evidencePreview.kind === 'source' && chunksBeforePdf && (
										<Button
											variant='subtle'
											size='compact-sm'
											leftSection={<IconArrowLeft size={15} />}
											onClick={() => {
												setEvidencePreview({
													kind: 'chunks',
													chunks: chunksBeforePdf,
												})
												setChunksBeforePdf(undefined)
											}}>
											Wstecz do chunków
										</Button>
									)}
									<ActionIcon
										variant='subtle'
										onClick={() => {
											setEvidencePreview(undefined)
											setChunksBeforePdf(undefined)
										}}
										aria-label='Zamknij podgląd'>
										<IconX size={18} />
									</ActionIcon>
								</Group>
							</Group>
							<Box style={{ flex: 1, minHeight: 0 }}>
								{evidencePreview.kind === 'source' && (
									<EvidenceSourcePreview source={evidencePreview.source} />
								)}
								{evidencePreview.kind === 'image' && (
									<ScrollArea h='100%'>
										<Box p='sm'>
											<ExpandedEvidenceImage image={evidencePreview.image} />
										</Box>
									</ScrollArea>
								)}
								{evidencePreview.kind === 'chunks' && (
									<ScrollArea h='100%'>
										<EvidenceChunksPreview
											chunks={evidencePreview.chunks}
											onOpenSource={(source) => {
												setChunksBeforePdf(evidencePreview.chunks)
												setEvidencePreview({ kind: 'source', source })
											}}
										/>
									</ScrollArea>
								)}
							</Box>
						</Stack>
					</Paper>
				)}
			</Box>
		</Stack>
	)
}

function ExpandedEvidenceImage({ image }: { image: EvidenceImage }) {
	const path = `/api/admin/chunks/files/${image.attachmentId}/images/${encodeURIComponent(image.filename)}`
	const { error, url } = useAuthenticatedAsset(path)
	if (error) return <Alert color='red'>Nie udało się załadować schematu.</Alert>
	if (!url)
		return (
			<Center h={400}>
				<Loader />
			</Center>
		)
	return (
		<img
			src={url}
			alt={image.filename}
			style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', margin: '0 auto' }}
		/>
	)
}

function EvidencePdfPage({
	attachmentId,
	container,
	pageNumber,
	pageRef,
	targetPage,
}: {
	attachmentId: number
	container: React.RefObject<HTMLDivElement | null>
	pageNumber: number
	pageRef: (element: HTMLDivElement | null) => void
	targetPage: number
}) {
	const elementRef = useRef<HTMLDivElement>(null)
	const [shouldLoad, setShouldLoad] = useState(Math.abs(pageNumber - targetPage) <= 1)
	const path = `/api/admin/chunks/files/${attachmentId}/preview/${pageNumber}`
	const { error, url } = useAuthenticatedAsset(path, shouldLoad)

	useEffect(() => {
		const element = elementRef.current
		if (!element || shouldLoad) return
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) setShouldLoad(true)
			},
			{ root: container.current, rootMargin: '800px 0px' },
		)
		observer.observe(element)
		return () => observer.disconnect()
	}, [container, shouldLoad])

	return (
		<div
			ref={(element) => {
				elementRef.current = element
				pageRef(element)
			}}
			style={{ marginBottom: 16 }}>
			<Text
				size='xs'
				fw={pageNumber === targetPage ? 700 : 500}
				c='dimmed'
				ta='center'
				mb={5}>
				Strona {pageNumber}
				{pageNumber === targetPage ? ' · źródło odpowiedzi' : ''}
			</Text>
			<Paper
				withBorder
				radius='sm'
				style={{
					aspectRatio: '0.707',
					overflow: 'hidden',
					borderColor:
						pageNumber === targetPage ? 'var(--mantine-color-blue-6)' : undefined,
				}}>
				{error && <Alert color='red'>Nie udało się załadować strony {pageNumber}.</Alert>}
				{!error && !url && (
					<Center h='100%'>
						<Loader size='sm' />
					</Center>
				)}
				{url && (
					<img
						src={url}
						alt={`Strona ${pageNumber}`}
						style={{
							display: 'block',
							width: '100%',
							height: '100%',
							objectFit: 'contain',
						}}
					/>
				)}
			</Paper>
		</div>
	)
}

function EvidenceSourcePreview({ source }: { source: EvidenceSource }) {
	const { data: file, isLoading } = useChunkFile(source.attachmentId)
	const containerRef = useRef<HTMLDivElement>(null)
	const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})

	useEffect(() => {
		if (!file) return
		const frame = requestAnimationFrame(() => {
			const container = containerRef.current
			const page = pageRefs.current[source.pageNumber]
			if (container && page) container.scrollTop = page.offsetTop - 12
		})
		return () => cancelAnimationFrame(frame)
	}, [file, source.pageNumber])

	if (isLoading)
		return (
			<Center h='100%'>
				<Loader />
			</Center>
		)
	if (!file || file.ingest_pages_total === 0) {
		return <Alert color='red'>Nie udało się odczytać stron dokumentu.</Alert>
	}

	return (
		<div ref={containerRef} style={{ height: '100%', overflow: 'auto', padding: 12 }}>
			{Array.from({ length: file.ingest_pages_total }, (_, index) => index + 1).map(
				(pageNumber) => (
					<EvidencePdfPage
						key={pageNumber}
						attachmentId={source.attachmentId}
						container={containerRef}
						pageNumber={pageNumber}
						targetPage={source.pageNumber}
						pageRef={(element) => {
							pageRefs.current[pageNumber] = element
						}}
					/>
				),
			)}
		</div>
	)
}

function EvidenceChunksPreview({
	chunks,
	onOpenSource,
}: {
	chunks: DebugMessageChunkRead[]
	onOpenSource: (source: EvidenceSource) => void
}) {
	return (
		<Stack p='md' gap='md'>
			{chunks.map((chunk, index) => {
				const pageNumber = (chunk.metadata?.page ?? 0) + 1
				return (
					<Paper key={chunk.id} withBorder p='md' radius='sm'>
						<Group justify='space-between' align='flex-start' mb='sm'>
							<div>
								<Text size='xs' fw={700} c='dimmed'>
									CHUNK #{index + 1}
								</Text>
								<Text fw={700}>{chunk.attachment_name}</Text>
							</div>
							<Stack gap={6} align='flex-end'>
								<Badge variant='light'>strona {pageNumber}</Badge>
								<Button
									variant='light'
									size='compact-xs'
									leftSection={<IconFileText size={13} />}
									rightSection={<IconChevronRight size={13} />}
									onClick={() =>
										onOpenSource({
											attachmentId: chunk.attachment_id,
											attachmentName: chunk.attachment_name,
											pageNumber,
										})
									}>
									Otwórz PDF
								</Button>
							</Stack>
						</Group>
						<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
							{chunk.content || 'Pusty chunk'}
						</Text>
						<Text size='xs' fw={700} c='dimmed' mt='md' mb={6}>
							METADANE
						</Text>
						<Code block>{JSON.stringify(chunk.metadata ?? {}, null, 2)}</Code>
					</Paper>
				)
			})}
		</Stack>
	)
}
