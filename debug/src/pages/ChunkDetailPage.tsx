import {
	ActionIcon,
	Alert,
	Badge,
	Box,
	Center,
	Code,
	Group,
	Loader,
	Modal,
	Paper,
	ScrollArea,
	Stack,
	Text,
	TextInput,
	Title,
} from '@mantine/core'
import {
	IconArrowLeft,
	IconChevronLeft,
	IconChevronRight,
	IconFileText,
	IconPhoto,
	IconZoomIn,
} from '@tabler/icons-react'
import { Link, useParams, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthenticatedAsset } from '@/hooks/useAuthenticatedAsset'
import { useChunkFile, usePageChunks } from '@/hooks/useChunks'

function PdfPage({
	attachmentId,
	container,
	pageNumber,
	pageRef,
}: {
	attachmentId: number
	container: React.RefObject<HTMLDivElement | null>
	pageNumber: number
	pageRef: (element: HTMLDivElement | null) => void
}) {
	const elementRef = useRef<HTMLDivElement>(null)
	const [shouldLoad, setShouldLoad] = useState(pageNumber <= 2)
	const path = `/api/admin/chunks/files/${attachmentId}/preview/${pageNumber}`
	const { error, url } = useAuthenticatedAsset(path, shouldLoad)

	useEffect(() => {
		const element = elementRef.current
		if (!element || shouldLoad) return
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) setShouldLoad(true)
			},
			{ root: container.current, rootMargin: '900px 0px' },
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
			data-page={pageNumber}
			style={{ margin: '0 auto 20px', minHeight: 720, maxWidth: 900 }}>
			<Text size='xs' c='dimmed' ta='center' mb={6}>
				Strona {pageNumber}
			</Text>
			<Paper withBorder radius='sm' style={{ minHeight: 700, overflow: 'hidden' }}>
				{error && <Alert color='red'>Nie udało się załadować strony {pageNumber}.</Alert>}
				{!error && !url && (
					<Center h={700}>
						<Loader size='sm' />
					</Center>
				)}
				{url && (
					<img
						src={url}
						alt={`Strona ${pageNumber}`}
						style={{ display: 'block', width: '100%' }}
					/>
				)}
			</Paper>
		</div>
	)
}

function ChunkImage({
	attachmentId,
	filename,
	onExpand,
}: {
	attachmentId: number
	filename: string
	onExpand: () => void
}) {
	const path = `/api/admin/chunks/files/${attachmentId}/images/${encodeURIComponent(filename)}`
	const { error, url } = useAuthenticatedAsset(path)

	return (
		<button
			type='button'
			onClick={onExpand}
			disabled={!url}
			style={{
				position: 'relative',
				width: 118,
				height: 88,
				padding: 0,
				overflow: 'hidden',
				border: '1px solid var(--mantine-color-default-border)',
				borderRadius: 'var(--mantine-radius-sm)',
				background: 'var(--mantine-color-default)',
				cursor: url ? 'zoom-in' : 'default',
			}}>
			{!url && !error && <Loader size='xs' />}
			{error && <IconPhoto size={22} />}
			{url && (
				<>
					<img
						src={url}
						alt={filename}
						style={{ width: '100%', height: '100%', objectFit: 'cover' }}
					/>
					<Center
						style={{
							position: 'absolute',
							right: 5,
							bottom: 5,
							width: 25,
							height: 25,
							borderRadius: 20,
							background: 'rgba(0, 0, 0, 0.7)',
						}}>
						<IconZoomIn color='white' size={15} />
					</Center>
				</>
			)}
		</button>
	)
}

function ExpandedChunkImage({
	attachmentId,
	filename,
}: {
	attachmentId: number
	filename: string
}) {
	const path = `/api/admin/chunks/files/${attachmentId}/images/${encodeURIComponent(filename)}`
	const { error, url } = useAuthenticatedAsset(path)
	if (error) return <Alert color='red'>Nie udało się załadować obrazu.</Alert>
	if (!url)
		return (
			<Center h={400}>
				<Loader />
			</Center>
		)
	return (
		<img
			src={url}
			alt={filename}
			style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', margin: '0 auto' }}
		/>
	)
}

export function ChunkDetailPage() {
	const { attachmentId } = useParams({ strict: false }) as { attachmentId: string }
	const { page: requestedPage } = useSearch({ strict: false }) as { page?: number }
	const id = Number(attachmentId)
	const { data: file, isLoading } = useChunkFile(id)
	const [pageNumber, setPageNumber] = useState(requestedPage ?? 1)
	const [pageInput, setPageInput] = useState(String(requestedPage ?? 1))
	const [expandedImage, setExpandedImage] = useState<string>()
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})
	const scrollFrameRef = useRef<number | null>(null)
	const appliedRequestedPageRef = useRef<number | null>(null)
	const { data: chunks, isLoading: chunksLoading } = usePageChunks(id, pageNumber)

	const pageImages = useMemo(
		() => Array.from(new Set((chunks ?? []).flatMap((chunk) => chunk.metadata?.images ?? []))),
		[chunks],
	)

	const goToPage = useCallback(
		(rawPage: number, smooth = true) => {
			const totalPages = Math.max(file?.ingest_pages_total ?? 1, 1)
			const nextPage = Math.min(totalPages, Math.max(1, Math.trunc(rawPage) || 1))
			setPageNumber(nextPage)
			setPageInput(String(nextPage))
			const container = scrollContainerRef.current
			const element = pageRefs.current[nextPage]
			if (container && element) {
				container.scrollTo({
					top: element.offsetTop - 12,
					behavior: smooth ? 'smooth' : 'auto',
				})
			}
		},
		[file?.ingest_pages_total],
	)

	function updateVisiblePage() {
		if (scrollFrameRef.current !== null) return
		scrollFrameRef.current = requestAnimationFrame(() => {
			scrollFrameRef.current = null
			const container = scrollContainerRef.current
			if (!container || !file) return
			const target = container.getBoundingClientRect().top + 80
			let closestPage = pageNumber
			let closestDistance = Number.POSITIVE_INFINITY
			for (let current = 1; current <= file.ingest_pages_total; current += 1) {
				const element = pageRefs.current[current]
				if (!element) continue
				const distance = Math.abs(element.getBoundingClientRect().top - target)
				if (distance < closestDistance) {
					closestDistance = distance
					closestPage = current
				}
			}
			if (closestPage !== pageNumber) {
				setPageNumber(closestPage)
				setPageInput(String(closestPage))
			}
		})
	}

	function submitPageInput() {
		goToPage(Number.parseInt(pageInput, 10), false)
	}

	useEffect(() => {
		if (file && pageNumber > Math.max(file.ingest_pages_total, 1)) goToPage(1, false)
	}, [file, goToPage, pageNumber])

	useEffect(() => {
		if (!file || !requestedPage || appliedRequestedPageRef.current === requestedPage) return
		appliedRequestedPageRef.current = requestedPage
		goToPage(requestedPage, false)
	}, [file, goToPage, requestedPage])

	useEffect(
		() => () => {
			if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
		},
		[],
	)

	if (isLoading)
		return (
			<Center h='60vh'>
				<Loader />
			</Center>
		)
	if (!file) return <Alert color='red'>Nie znaleziono pliku.</Alert>

	return (
		<Stack gap='md' h='calc(100vh - 32px)'>
			<Group justify='space-between' wrap='nowrap'>
				<Group wrap='nowrap'>
					<ActionIcon
						component={Link}
						to='/chunks'
						variant='default'
						size='lg'
						aria-label='Wróć'>
						<IconArrowLeft size={18} />
					</ActionIcon>
					<div>
						<Title order={3}>{file.original_filename}</Title>
						<Text size='sm' c='dimmed'>
							{file.organization_name} · {file.chunk_count} chunków
						</Text>
					</div>
				</Group>
				<Group wrap='nowrap'>
					<ActionIcon
						variant='default'
						disabled={pageNumber <= 1}
						onClick={() => goToPage(pageNumber - 1)}>
						<IconChevronLeft size={18} />
					</ActionIcon>
					<TextInput
						w={150}
						value={pageInput}
						onChange={(event) =>
							setPageInput(event.currentTarget.value.replace(/\D/g, ''))
						}
						onBlur={submitPageInput}
						onKeyDown={(event) => {
							if (event.key === 'Enter') submitPageInput()
						}}
						leftSection={<Text size='xs'>Str.</Text>}
						rightSection={
							<Text size='xs' c='dimmed' pr={8}>
								/ {file.ingest_pages_total}
							</Text>
						}
						rightSectionWidth={54}
						aria-label='Numer strony'
					/>
					<ActionIcon
						variant='default'
						disabled={pageNumber >= file.ingest_pages_total}
						onClick={() => goToPage(pageNumber + 1)}>
						<IconChevronRight size={18} />
					</ActionIcon>
				</Group>
			</Group>

			<Box
				style={{
					display: 'grid',
					gridTemplateColumns: 'minmax(0, 1.15fr) minmax(380px, 0.85fr)',
					gap: 16,
					minHeight: 0,
					flex: 1,
				}}>
				<Paper withBorder radius='md' style={{ minHeight: 0, overflow: 'hidden' }}>
					<div
						ref={scrollContainerRef}
						onScroll={updateVisiblePage}
						style={{ height: '100%', overflow: 'auto', padding: 16 }}>
						{Array.from(
							{ length: file.ingest_pages_total },
							(_, index) => index + 1,
						).map((currentPage) => (
							<PdfPage
								key={currentPage}
								attachmentId={id}
								container={scrollContainerRef}
								pageNumber={currentPage}
								pageRef={(element) => {
									pageRefs.current[currentPage] = element
								}}
							/>
						))}
					</div>
				</Paper>

				<Paper withBorder radius='md' p='md' style={{ minHeight: 0, overflow: 'hidden' }}>
					<Stack h='100%' gap='sm'>
						<Group justify='space-between'>
							<Group gap='xs'>
								<IconFileText size={19} />
								<Text fw={700}>Chunki dla strony {pageNumber}</Text>
							</Group>
							<Badge variant='light'>{chunks?.length ?? 0}</Badge>
						</Group>
						<ScrollArea style={{ flex: 1, minHeight: 0 }}>
							<Stack gap='sm' pr='xs'>
								{pageImages.length > 0 && (
									<Paper withBorder p='sm' radius='sm'>
										<Text size='xs' fw={700} c='dimmed' mb='xs'>
											OBRAZY ZE STRONY
										</Text>
										<Group gap='xs'>
											{pageImages.map((filename) => (
												<ChunkImage
													key={filename}
													attachmentId={id}
													filename={filename}
													onExpand={() => setExpandedImage(filename)}
												/>
											))}
										</Group>
									</Paper>
								)}
								{chunksLoading && <Loader size='sm' />}
								{!chunksLoading && (chunks ?? []).length === 0 && (
									<Text c='dimmed'>Ta strona nie ma przypisanych chunków.</Text>
								)}
								{(chunks ?? []).map((chunk, index) => (
									<Paper key={chunk.id} withBorder p='md' radius='sm'>
										<Group justify='space-between' mb='xs'>
											<Text size='sm' fw={700}>
												#{index + 1}
											</Text>
											<Code>id: {chunk.id}</Code>
										</Group>
										<Text size='sm' style={{ whiteSpace: 'pre-wrap' }}>
											{chunk.content}
										</Text>
										<Code block mt='sm'>
											{JSON.stringify(chunk.metadata ?? {}, null, 2)}
										</Code>
									</Paper>
								))}
							</Stack>
						</ScrollArea>
					</Stack>
				</Paper>
			</Box>

			<Modal
				opened={expandedImage !== undefined}
				onClose={() => setExpandedImage(undefined)}
				title={expandedImage}
				size='xl'
				centered>
				{expandedImage && <ExpandedChunkImage attachmentId={id} filename={expandedImage} />}
			</Modal>
		</Stack>
	)
}
