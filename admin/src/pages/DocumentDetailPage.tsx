import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import {
	attachmentFileUrl,
	useAttachment,
	useAttachmentDevices,
	useDeleteAttachment,
} from '@/hooks/useAttachments'
import { useStartIngestion } from '@/hooks/useIngestions'
import { API_URL } from '@/lib/api'
import { getDocumentCategory, type DocumentCategory } from '@/lib/documentCategory'
import { canProcess, canRetry } from '@/lib/ingestion'
import { machineCountLabel } from '@/lib/pluralize'
import type { Attachment, Device } from '@/lib/types'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	Clock3,
	Download,
	FileCog,
	FileText,
	Hammer,
	LoaderCircle,
	Play,
	RotateCcw,
	ScrollText,
	ShieldAlert,
	Trash2,
	Workflow,
	ZoomIn,
	ZoomOut,
	type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './DocumentDetailPage.css'

const CATEGORY_STYLE: Record<DocumentCategory, { icon: LucideIcon; iconClassName: string }> = {
	Instrukcja: { icon: ScrollText, iconClassName: 'text-sky-300' },
	'Kody błędów': { icon: ShieldAlert, iconClassName: 'text-violet-300' },
	Schemat: { icon: Workflow, iconClassName: 'text-teal-300' },
	Biuletyn: { icon: FileCog, iconClassName: 'text-indigo-300' },
	Dokument: { icon: FileText, iconClassName: 'text-slate-300' },
}

function formatDate(value: string): string {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString('pl-PL', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function formatBytes(size?: number): string {
	if (size === undefined) return 'Brak danych'
	if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
	return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function usePdfDocument(attachmentId: number) {
	const [pageUrls, setPageUrls] = useState<Record<number, string>>({})
	const [fileSize, setFileSize] = useState<number>()
	const [totalPages, setTotalPages] = useState<number>()
	const [error, setError] = useState<string>()

	useEffect(() => {
		let active = true
		const controller = new AbortController()
		const objectUrls: string[] = []
		setPageUrls({})
		setTotalPages(undefined)
		setError(undefined)

		async function loadPage(pageNumber: number): Promise<number | undefined> {
			const response = await fetch(
				`${API_URL}/api/attachments/${attachmentId}/preview/${pageNumber}?zoom=1`,
				{ credentials: 'include', signal: controller.signal },
			)
			if (!response.ok) throw new Error(`PDF preview request failed: ${response.status}`)

			const pageCount = Number(response.headers.get('X-PDF-Page-Count'))
			const size = Number(response.headers.get('X-File-Size'))
			const blob = await response.blob()
			if (!active) return undefined

			const objectUrl = URL.createObjectURL(blob)
			objectUrls.push(objectUrl)
			setPageUrls((current) => ({ ...current, [pageNumber]: objectUrl }))
			if (Number.isFinite(size) && size >= 0) setFileSize(size)
			return Number.isFinite(pageCount) && pageCount > 0 ? pageCount : undefined
		}

		void (async () => {
			try {
				const pageCount = await loadPage(1)
				if (!active || pageCount === undefined) return
				const resolvedPageCount = pageCount
				setTotalPages(resolvedPageCount)

				let nextPage = 2
				async function worker() {
					while (active && nextPage <= resolvedPageCount) {
						const pageNumber = nextPage++
						await loadPage(pageNumber)
					}
				}

				await Promise.all(
					Array.from({ length: Math.min(3, resolvedPageCount - 1) }, worker),
				)
			} catch (loadError) {
				if (
					active &&
					!(loadError instanceof DOMException && loadError.name === 'AbortError')
				) {
					setError('Nie udało się załadować podglądu PDF.')
				}
			}
		})()

		return () => {
			active = false
			controller.abort()
			objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
		}
	}, [attachmentId])

	return { error, fileSize, pageUrls, totalPages }
}

function PreviewCard({
	attachment,
	fileUrl,
	onFileSize,
}: {
	attachment: Attachment
	fileUrl: string
	onFileSize: (size: number) => void
}) {
	const [page, setPage] = useState(1)
	const [zoom, setZoom] = useState(100)
	const { error: previewError, fileSize, pageUrls, totalPages } = usePdfDocument(attachment.id)
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const pageRefs = useRef<Record<number, HTMLDivElement | null>>({})
	const category = getDocumentCategory(attachment.original_filename)
	const categoryStyle = CATEGORY_STYLE[category]
	const PreviewIcon = categoryStyle.icon

	useEffect(() => {
		if (fileSize !== undefined) onFileSize(fileSize)
	}, [fileSize, onFileSize])

	useEffect(() => {
		if (totalPages !== undefined && page > totalPages) setPage(totalPages)
	}, [page, totalPages])

	function changePage(rawValue: string) {
		const numeric = Number.parseInt(rawValue.replace(/\D/g, ''), 10) || 1
		const nextPage = Math.min(totalPages ?? Number.MAX_SAFE_INTEGER, Math.max(1, numeric))
		setPage(nextPage)
		pageRefs.current[nextPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}

	function updateVisiblePage() {
		const container = scrollContainerRef.current
		if (!container || totalPages === undefined) return
		const viewportTop = container.getBoundingClientRect().top + 24
		let closestPage = 1
		let closestDistance = Number.POSITIVE_INFINITY
		for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
			const element = pageRefs.current[pageNumber]
			if (!element) continue
			const distance = Math.abs(element.getBoundingClientRect().top - viewportTop)
			if (distance < closestDistance) {
				closestDistance = distance
				closestPage = pageNumber
			}
		}
		setPage(closestPage)
	}

	return (
		<section className='document-preview flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#2d3745] bg-[#171e27]'>
			<header className='document-preview__header flex h-[54px] shrink-0 items-center justify-between border-b border-[#2d3745] px-5'>
				<div className='flex items-center'>
					<span className='flex size-9 items-center justify-center rounded-md border border-white/[0.08] bg-[#151d27]'>
						<PreviewIcon
							size={21}
							className={categoryStyle.iconClassName}
							strokeWidth={2.3}
						/>
					</span>
					<h2 className='ml-3 text-lg font-medium text-[#dfe6ef]'>Podgląd dokumentu</h2>
				</div>
				<div className='flex items-center gap-3'>
					<label className='flex items-center'>
						<span className='mr-2 text-xs font-black tracking-[0.4px] text-[#9aa4b2] uppercase'>
							Strona
						</span>
						<input
							value={page}
							onChange={(event) => changePage(event.target.value)}
							inputMode='numeric'
							className='h-8 w-14 rounded-md border border-[#2d3745] bg-[#0f161d] px-2 text-center text-[13px] font-black text-[#dfe6ef] outline-none focus:border-ember'
						/>
						<span className='ml-2 text-xs font-medium text-[#9aa4b2]'>
							z {totalPages ?? '—'}
						</span>
					</label>
					<a
						href={fileUrl}
						download={attachment.original_filename}
						className='flex h-8 items-center justify-center rounded-md border border-[#2d3745] bg-[#1a212b] px-3 text-[11px] font-black text-[#dbe3ee] hover:bg-[#222b36]'>
						<Download size={13} className='mr-2' />
						Pobierz
					</a>
				</div>
			</header>

			<div className='document-preview__body relative min-h-0 flex-1 overflow-hidden bg-[#0e161d]'>
				{totalPages !== undefined && (
					<div
						ref={scrollContainerRef}
						onScroll={updateVisiblePage}
						className='document-preview__scroll h-full w-full overflow-auto px-5 py-[18px]'>
						{Array.from({ length: totalPages }, (_, index) => index + 1).map(
							(pageNumber) => (
								<div
									key={pageNumber}
									ref={(element) => {
										pageRefs.current[pageNumber] = element
									}}
									className='document-preview__page'
									style={{
										width: `min(${Math.round(714 * (zoom / 100))}px, ${zoom}%)`,
									}}>
									{pageUrls[pageNumber] ? (
										<img
											src={pageUrls[pageNumber]}
											alt={`Strona ${pageNumber} dokumentu ${attachment.original_filename}`}
											className='block w-full bg-white'
										/>
									) : (
										<div className='document-preview__page-placeholder'>
											Ładowanie strony {pageNumber}…
										</div>
									)}
								</div>
							),
						)}
					</div>
				)}
				{totalPages === undefined && !previewError && (
					<div className='flex h-full items-center justify-center text-sm font-semibold text-[#dfe6ef]'>
						Ładowanie podglądu PDF…
					</div>
				)}
				{previewError && (
					<div className='flex h-full flex-col items-center justify-center px-8 text-center'>
						<FileText size={42} className='text-[#ffb36f]' />
						<p className='mt-4 text-[15px] font-semibold text-[#dfe6ef]'>
							{previewError}
						</p>
						<a
							href={fileUrl}
							className='mt-3 text-sm font-bold text-ember hover:underline'>
							Otwórz plik
						</a>
					</div>
				)}

				<div className='absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center rounded-full bg-[#343d48] px-3 py-2 select-none'>
					<button
						type='button'
						disabled={zoom <= 75}
						onClick={() => setZoom((current) => Math.max(75, current - 25))}
						className='flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-[#46505d] disabled:cursor-not-allowed disabled:opacity-35'>
						<ZoomOut size={18} />
					</button>
					<span className='mx-3 w-11 text-center text-xs font-black text-[#dfe7f2]'>
						{zoom}%
					</span>
					<button
						type='button'
						disabled={zoom >= 200}
						onClick={() => setZoom((current) => Math.min(200, current + 25))}
						className='flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-[#46505d] disabled:cursor-not-allowed disabled:opacity-35'>
						<ZoomIn size={18} />
					</button>
				</div>
			</div>
		</section>
	)
}

type StatusTone = {
	border: string
	background: string
	iconBackground: string
	icon: LucideIcon
	iconClassName: string
	title: string
	titleClassName: string
	description: string
}

function statusTone(attachment: Attachment, hasAssignedMachines: boolean): StatusTone {
	if (attachment.ingest_status === 'failed') {
		return {
			border: 'border-[#71363a]',
			background: 'bg-[#321e22]',
			iconBackground: 'bg-[#4a2529]',
			icon: AlertTriangle,
			iconClassName: 'text-red-300',
			title: 'Status: Błąd importu',
			titleClassName: 'text-red-300',
			description: attachment.ingest_error ?? 'Dokument wymaga ponownego przetworzenia.',
		}
	}
	if (attachment.ingest_status === 'queued' || attachment.ingest_status === 'running') {
		return {
			border: 'border-[#315a73]',
			background: 'bg-[#142a36]',
			iconBackground: 'bg-[#1c4052]',
			icon: LoaderCircle,
			iconClassName: 'text-sky-300',
			title:
				attachment.ingest_status === 'queued'
					? 'Status: W kolejce'
					: 'Status: Przetwarzanie',
			titleClassName: 'text-sky-300',
			description:
				attachment.ingest_status === 'running' && attachment.ingest_pages_total > 0
					? `Przetworzono ${attachment.ingest_pages_done} z ${attachment.ingest_pages_total} stron.`
					: 'Dokument jest przygotowywany do użycia przez Asystenta.',
		}
	}
	if (attachment.ingest_status === 'ready') {
		return {
			border: 'border-[#8d540f]',
			background: 'bg-[#3a2b1b]',
			iconBackground: 'bg-[#4a351d]',
			icon: Clock3,
			iconClassName: 'text-[#ff921f]',
			title: 'Status: Oczekuje',
			titleClassName: 'text-[#ff921f]',
			description: 'Uruchom przetwarzanie, aby dokument był dostępny dla Asystenta.',
		}
	}
	if (!hasAssignedMachines) {
		return {
			border: 'border-[#8d540f]',
			background: 'bg-[#3a2b1b]',
			iconBackground: 'bg-[#4a351d]',
			icon: AlertTriangle,
			iconClassName: 'text-[#ff921f]',
			title: 'Status: Wymaga przypisania',
			titleClassName: 'text-[#ff921f]',
			description:
				'Przypisz dokument do maszyny, aby Asystent używał go we właściwym kontekście.',
		}
	}
	return {
		border: 'border-[#114d3d]',
		background: 'bg-[#0d2b27]',
		iconBackground: 'bg-[#104b3b]',
		icon: CheckCircle2,
		iconClassName: 'text-[#20e288]',
		title: 'Status: Gotowy do użycia',
		titleClassName: 'text-[#20e288]',
		description: 'Dokument jest dostępny w bazie wiedzy i może być używany przez Asystenta.',
	}
}

function StatusCard({
	attachment,
	hasAssignedMachines,
	onProcess,
	onRetry,
	pending,
}: {
	attachment: Attachment
	hasAssignedMachines: boolean
	onProcess: () => void
	onRetry: () => void
	pending: boolean
}) {
	const tone = statusTone(attachment, hasAssignedMachines)
	const Icon = tone.icon
	const processable = canProcess(attachment.ingest_status)
	const retryable = canRetry(attachment.ingest_status)

	return (
		<section
			data-tone={
				attachment.ingest_status === 'failed'
					? 'danger'
					: attachment.ingest_status === 'queued' ||
						  attachment.ingest_status === 'running'
						? 'info'
						: attachment.ingest_status === 'ready' || !hasAssignedMachines
							? 'warning'
							: 'success'
			}
			className={`flex items-start rounded-lg border px-4 py-3 ${tone.border} ${tone.background}`}>
			<span
				className={`mr-4 flex size-9 shrink-0 items-center justify-center rounded-full ${tone.iconBackground}`}>
				<Icon size={20} className={tone.iconClassName} strokeWidth={2.4} />
			</span>
			<div className='min-w-0 flex-1'>
				<h2
					className={`text-xs font-black tracking-[0.7px] uppercase ${tone.titleClassName}`}>
					{tone.title}
				</h2>
				<p className='mt-1 text-xs leading-[17px] font-medium text-[#c5d4d1]'>
					{tone.description}
				</p>
			</div>
			{(processable || retryable) && (
				<button
					type='button'
					title={processable ? 'Przetwórz' : 'Ponów import'}
					disabled={pending}
					onClick={processable ? onProcess : onRetry}
					className='ml-3 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/[0.12] text-[#dfe6ef] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40'>
					{processable ? <Play size={16} /> : <RotateCcw size={16} />}
				</button>
			)}
		</section>
	)
}

function InfoItem({ label, value }: { label: string; value: string }) {
	return (
		<div className='mb-4 last:mb-0'>
			<dt className='text-[11px] font-black tracking-[0.4px] text-[#c3cad5]'>{label}</dt>
			<dd className='mt-1 line-clamp-2 text-sm leading-[19px] font-medium text-[#dfe6ef]'>
				{value}
			</dd>
		</div>
	)
}

function FileInfoCard({
	attachment,
	fileSize,
	machineCount,
}: {
	attachment: Attachment
	fileSize?: number
	machineCount: number
}) {
	return (
		<section className='document-side-card rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5'>
			<h2 className='mb-4 text-lg font-medium text-[#dfe6ef]'>Informacje o dokumencie</h2>
			<dl>
				<InfoItem label='Nazwa dokumentu' value={attachment.original_filename} />
				<InfoItem
					label='Rodzaj'
					value={getDocumentCategory(attachment.original_filename)}
				/>
				<InfoItem label='Data dodania' value={formatDate(attachment.created_at)} />
				<InfoItem label='Używane przez' value={machineCountLabel(machineCount)} />
				<InfoItem label='Rozmiar' value={formatBytes(fileSize)} />
			</dl>
		</section>
	)
}

function MachineRow({ device }: { device: Device }) {
	return (
		<Link
			to='/machines/$deviceId'
			params={{ deviceId: String(device.id) }}
			className='flex min-h-[66px] items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3 py-2 hover:bg-[#222b36]'>
			<span className='flex h-[46px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded border border-[#2d3745] bg-[#0c1219]'>
				{device.image_url ? (
					<img src={device.image_url} alt='' className='h-full w-full object-cover' />
				) : (
					<Hammer size={19} className='text-[#cfd6e0]' />
				)}
			</span>
			<span className='ml-3 min-w-0 flex-1'>
				<span className='block truncate text-sm font-semibold text-[#dfe6ef]'>
					{device.name}
				</span>
				{device.model_serial_code && (
					<span className='mt-0.5 block truncate text-[11px] text-[#9aa4b2]'>
						{device.model_serial_code}
					</span>
				)}
			</span>
		</Link>
	)
}

function RelatedMachinesCard({ devices, onEdit }: { devices: Device[]; onEdit: () => void }) {
	return (
		<section className='document-side-card rounded-lg border border-[#2d3745] bg-[#1a212b] px-5 py-5'>
			<div className='mb-4 flex items-center justify-between'>
				<h2 className='text-lg font-medium text-[#dfe6ef]'>Powiązane maszyny</h2>
				<button
					type='button'
					onClick={onEdit}
					className='cursor-pointer rounded-md px-2 py-1.5 text-xs font-black text-[#ffb36f] hover:bg-[#222b36]'>
					Zmień
				</button>
			</div>

			<div className='space-y-2.5'>
				{devices.length === 0 && (
					<div className='flex h-[43px] items-center rounded-md border border-[#2d3745] bg-[#171e27] px-3'>
						<Hammer size={19} className='text-[#cfd6e0]' />
						<span className='ml-3 text-sm font-medium text-[#dfe6ef]'>
							Brak powiązanych maszyn
						</span>
					</div>
				)}
				{devices.map((device) => (
					<MachineRow key={device.id} device={device} />
				))}
			</div>
		</section>
	)
}

function DangerCard({ onDelete }: { onDelete: () => void }) {
	return (
		<section className='document-side-card document-danger-card rounded-lg border border-[#4a2d31] bg-[#1a212b] px-5 py-5'>
			<h2 className='text-lg font-medium text-[#f4c3c0]'>Strefa niebezpieczna</h2>
			<p className='mt-1 text-xs leading-[17px] font-medium text-[#c9aaa5]'>
				Trwałe działania dotyczące dokumentu.
			</p>
			<button
				type='button'
				onClick={onDelete}
				className='mt-4 flex h-[45px] w-full cursor-pointer items-center justify-center rounded-md border border-[#f09a91] text-xs font-black text-[#f09a91] hover:bg-red-400/[0.06]'>
				<Trash2 size={15} className='mr-3' />
				Usuń dokument
			</button>
			<div className='mt-3 flex items-start text-[#d7c9b4]'>
				<AlertTriangle size={14} className='mt-0.5 shrink-0' />
				<p className='ml-2 text-[11px] leading-[15px] font-medium'>
					Po usunięciu asystent nie będzie już korzystał z tego dokumentu.
				</p>
			</div>
		</section>
	)
}

export function DocumentDetailPage() {
	const { attachmentId } = useParams({ strict: false }) as { attachmentId: string }
	const id = Number(attachmentId)
	const navigate = useNavigate()
	const fileUrl = useMemo(() => attachmentFileUrl(id), [id])
	const { data: attachment, isLoading } = useAttachment(id)
	const { data: linkedDevices } = useAttachmentDevices(id)
	const [fileSize, setFileSize] = useState<number>()
	const deleteAttachment = useDeleteAttachment()
	const startIngestion = useStartIngestion()
	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [showRetryModal, setShowRetryModal] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleDelete() {
		try {
			await deleteAttachment.mutateAsync(id)
			void navigate({ to: '/' })
		} catch (deleteError) {
			setError(
				deleteError instanceof Error
					? deleteError.message
					: 'Nie udało się usunąć dokumentu.',
			)
			setShowDeleteModal(false)
		}
	}

	return (
		<div className='document-detail-page -m-8 flex h-screen min-w-[980px] flex-col overflow-hidden bg-[#0f161d] px-5 pt-7 pb-5 text-[#dfe7f2]'>
			<div className='mb-[31px] shrink-0'>
				<Link
					to='/'
					className='document-detail-back inline-flex h-9 items-center justify-center rounded-lg border border-slate-400/[0.18] px-3 text-[13px] font-bold text-[#aab4c0] hover:border-ember/35 hover:bg-white/[0.04]'>
					<ArrowLeft size={17} className='mr-2' strokeWidth={2.5} />
					Wróć do dokumentów
				</Link>
				<h1 className='mt-4 truncate text-[28px] leading-[38px] font-black'>
					Szczegóły dokumentu
				</h1>
			</div>

			{isLoading && (
				<div className='flex min-h-0 flex-1 items-center justify-center rounded-lg border border-[#2d3745] bg-[#171e27] text-base font-semibold'>
					Ładowanie dokumentu…
				</div>
			)}
			{!isLoading && !attachment && (
				<div className='flex min-h-0 flex-1 items-center justify-center rounded-lg border border-[#8d540f] bg-[#1b222b] text-base font-semibold text-[#ff9300]'>
					Nie udało się załadować dokumentu.
				</div>
			)}

			{attachment && (
				<div className='flex min-h-0 flex-1 gap-5'>
					<PreviewCard
						attachment={attachment}
						fileUrl={fileUrl}
						onFileSize={setFileSize}
					/>
					<aside className='document-detail-aside w-[min(420px,34vw)] min-w-[340px] shrink-0 overflow-y-auto'>
						<div className='space-y-5 pb-1'>
							<StatusCard
								attachment={attachment}
								hasAssignedMachines={(linkedDevices?.length ?? 0) > 0}
								pending={startIngestion.isPending}
								onProcess={() => startIngestion.mutate(id)}
								onRetry={() => setShowRetryModal(true)}
							/>
							<FileInfoCard
								attachment={attachment}
								fileSize={fileSize}
								machineCount={linkedDevices?.length ?? 0}
							/>
							<RelatedMachinesCard
								devices={linkedDevices ?? []}
								onEdit={() =>
									void navigate({
										to: '/documents/$attachmentId/machines',
										params: { attachmentId: String(id) },
									})
								}
							/>
							{error && (
								<p className='rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200'>
									{error}
								</p>
							)}
							<DangerCard onDelete={() => setShowDeleteModal(true)} />
						</div>
					</aside>
				</div>
			)}

			{showDeleteModal && attachment && (
				<ConfirmDeleteModal
					title='Usuń dokument'
					description={`Dokument "${attachment.original_filename}" zostanie trwale usunięty.`}
					pending={deleteAttachment.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
			{showRetryModal && attachment && (
				<ConfirmModal
					title='Ponów przetwarzanie'
					description={`Dokument "${attachment.original_filename}" zostanie przetworzony ponownie. Obecnie zaindeksowane fragmenty zostaną usunięte i zastąpione nowymi.`}
					confirmLabel='Ponów'
					pendingLabel='Uruchamianie…'
					pending={startIngestion.isPending}
					onConfirm={() => {
						startIngestion.mutate(id)
						setShowRetryModal(false)
					}}
					onClose={() => setShowRetryModal(false)}
				/>
			)}
		</div>
	)
}
