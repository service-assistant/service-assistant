import { ConfirmModal } from '@/components/ConfirmModal'
import { useAttachments } from '@/hooks/useAttachments'
import { useDevices } from '@/hooks/useDevices'
import { useProcessReadyAttachments, useStartIngestion } from '@/hooks/useIngestions'
import { api } from '@/lib/api'
import {
	DOCUMENT_CATEGORY_BADGE_CLASSES,
	getDocumentCategory,
	type DocumentCategory,
} from '@/lib/documentCategory'
import { INGESTION_STATUS_LABELS, canProcess, canRetry } from '@/lib/ingestion'
import { machineCountLabel, pluralizePl } from '@/lib/pluralize'
import type { Attachment, Device, IngestionStatus } from '@/lib/types'
import { useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
	CalendarDays,
	ChevronDown,
	FileCog,
	FileText,
	Play,
	Plus,
	RotateCcw,
	ScrollText,
	Search,
	ShieldAlert,
	Workflow,
	type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'

type StatusPresentation = { dot: string; label: string; pill: string; text: string }

const STATUS_PRESENTATION: Record<IngestionStatus, StatusPresentation> = {
	ready: {
		dot: 'bg-orange-400',
		label: 'Oczekuje',
		pill: '',
		text: 'text-[#d6b08a]',
	},
	queued: {
		dot: 'bg-sky-400',
		label: INGESTION_STATUS_LABELS.queued,
		pill: 'border border-sky-400/30 bg-sky-400/10',
		text: 'text-sky-200',
	},
	running: {
		dot: 'bg-amber-400',
		label: INGESTION_STATUS_LABELS.running,
		pill: 'border border-amber-400/30 bg-amber-400/10',
		text: 'text-amber-200',
	},
	succeeded: {
		dot: 'bg-emerald-400',
		label: INGESTION_STATUS_LABELS.succeeded,
		pill: '',
		text: 'text-[#9fb6aa]',
	},
	failed: {
		dot: 'bg-red-400',
		label: 'Błąd importu',
		pill: '',
		text: 'text-red-300',
	},
}

const CATEGORY_ICONS: Record<DocumentCategory, LucideIcon> = {
	Instrukcja: ScrollText,
	'Kody błędów': ShieldAlert,
	Schemat: Workflow,
	Biuletyn: FileCog,
	Dokument: FileText,
}

const CATEGORY_ICON_CLASSES: Record<DocumentCategory, string> = {
	Instrukcja: 'border-sky-400/20 text-sky-300',
	'Kody błędów': 'border-violet-400/25 text-violet-300',
	Schemat: 'border-teal-400/25 text-teal-300',
	Biuletyn: 'border-indigo-400/25 text-indigo-300',
	Dokument: 'border-white/10 text-slate-400',
}

function formatDate(value: string): string {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString('pl-PL', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
}

function formatSyncTime(timestamp: number): string {
	if (!timestamp) return 'oczekiwanie na synchronizację'
	const date = new Date(timestamp)
	const now = new Date()
	const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
	return date.toDateString() === now.toDateString()
		? `dzisiaj ${time}`
		: formatDate(date.toISOString())
}

function machineLabel(devices: Device[] | undefined): string {
	if (devices === undefined) return '…'
	if (devices.length === 0) return 'Brak przypisania'
	if (devices.length === 1) return devices[0].name
	return `${devices.length} podłączonych maszyn`
}

function DocumentRow({ attachment, devices }: { attachment: Attachment; devices?: Device[] }) {
	const startIngestion = useStartIngestion()
	const category = getDocumentCategory(attachment.original_filename)
	const Icon = CATEGORY_ICONS[category]
	const status = STATUS_PRESENTATION[attachment.ingest_status]
	const [confirmRetry, setConfirmRetry] = useState(false)

	return (
		<>
			<Link
				to='/documents/$attachmentId'
				params={{ attachmentId: String(attachment.id) }}
				className='group relative grid min-h-[88px] grid-cols-[minmax(320px,2.35fr)_minmax(130px,.75fr)_minmax(220px,1.35fr)_minmax(170px,.82fr)_minmax(190px,1.28fr)] items-center border border-transparent border-b-white/[0.08] px-4 text-sm transition-colors hover:rounded-md hover:border-white/[0.08] hover:border-l-ember hover:bg-[#1b2633]'>
				<span className='flex min-w-0 items-center'>
					<span
						className={`relative flex size-[46px] shrink-0 items-center justify-center rounded-md border bg-[#151d27] ${CATEGORY_ICON_CLASSES[category]}`}>
						<Icon size={24} strokeWidth={2.3} />
						{attachment.ingest_status === 'running' && (
							<span className='absolute bottom-0 h-[3px] w-6 rounded bg-ember' />
						)}
					</span>
					<span className='ml-[17px] truncate text-[15px] font-semibold text-[#e8eaed]'>
						{attachment.original_filename}
					</span>
				</span>
				<span>
					<span
						className={`rounded border px-2 py-[3px] text-[11px] font-extrabold ${DOCUMENT_CATEGORY_BADGE_CLASSES[category]}`}>
						{category}
					</span>
				</span>
				<span
					className={`truncate text-[14px] font-medium ${devices?.length === 0 ? 'text-[#d6b08a]' : 'text-[#e8eaed]'}`}>
					{machineLabel(devices)}
				</span>
				<span>
					<span
						className={`inline-flex items-center rounded-full px-2.5 py-[5px] ${status.pill}`}>
						<span className={`mr-2 size-[7px] rounded-full ${status.dot}`} />
						<span className={`truncate text-xs font-extrabold ${status.text}`}>
							{status.label}
						</span>
					</span>
				</span>
				<span className='flex items-center pr-16 text-[13px] font-medium text-[#9aa4b2]'>
					<CalendarDays size={16} className='mr-2 shrink-0 text-ember' />
					<span className='truncate'>{formatDate(attachment.created_at)}</span>
				</span>
				<span className='absolute right-4 flex items-center gap-2'>
					{canProcess(attachment.ingest_status) && (
						<button
							type='button'
							title='Przetwórz'
							disabled={startIngestion.isPending}
							onClick={(event) => {
								event.preventDefault()
								event.stopPropagation()
								startIngestion.mutate(attachment.id)
							}}
							className='cursor-pointer rounded bg-[#151d27] p-2 text-ember hover:text-[#ffad55] disabled:cursor-not-allowed disabled:opacity-40'>
							<Play size={15} />
						</button>
					)}
					{canRetry(attachment.ingest_status) && (
						<button
							type='button'
							title='Przetwórz ponownie'
							disabled={startIngestion.isPending}
							onClick={(event) => {
								event.preventDefault()
								event.stopPropagation()
								setConfirmRetry(true)
							}}
							className='cursor-pointer rounded bg-[#151d27] p-2 text-ember hover:text-[#ffad55] disabled:cursor-not-allowed disabled:opacity-40'>
							<RotateCcw size={15} />
						</button>
					)}
					<span className='text-xs font-extrabold text-[#ff921f] opacity-0 transition-opacity group-hover:opacity-100'>
						Otwórz
					</span>
				</span>
			</Link>
			{confirmRetry && (
				<ConfirmModal
					title='Ponów przetwarzanie'
					description={`Dokument "${attachment.original_filename}" zostanie przetworzony ponownie. Obecnie zaindeksowane fragmenty zostaną usunięte i zastąpione nowymi.`}
					confirmLabel='Ponów'
					pendingLabel='Uruchamianie…'
					pending={startIngestion.isPending}
					onConfirm={() => {
						startIngestion.mutate(attachment.id)
						setConfirmRetry(false)
					}}
					onClose={() => setConfirmRetry(false)}
				/>
			)}
		</>
	)
}

function StatCard({
	accent,
	detail,
	detailClassName = 'text-[#9aa4b2]',
	icon: Icon,
	iconClassName,
	label,
	value,
}: {
	accent: string
	detail: string
	detailClassName?: string
	icon: LucideIcon
	iconClassName: string
	label: string
	value: number
}) {
	return (
		<div className='h-24 rounded-md border border-white/[0.08] bg-[#151d27] px-5 py-4'>
			<div className='mb-2 flex items-center justify-between'>
				<div className='flex min-w-0 items-center text-[13px] font-extrabold text-[#e8eaed]'>
					<span className={`mr-2 size-[7px] shrink-0 rounded-full ${accent}`} />
					<span className='truncate'>{label}</span>
				</div>
				<Icon size={18} className={iconClassName} strokeWidth={2.3} />
			</div>
			<div className='flex items-baseline'>
				<span className='mr-2 text-[30px] leading-8 font-black text-[#e8eaed]'>
					{value}
				</span>
				<span className={`truncate text-xs font-semibold ${detailClassName}`}>
					{detail}
				</span>
			</div>
		</div>
	)
}

function FilterSelect({ children, label }: { children: React.ReactNode; label: string }) {
	return (
		<label className='relative w-[180px] shrink-0'>
			<span className='sr-only'>{label}</span>
			{children}
			<ChevronDown
				size={18}
				className='pointer-events-none absolute top-3.5 right-3 text-[#6f7a88]'
			/>
		</label>
	)
}

const selectClassName =
	'h-[46px] w-full appearance-none rounded-md border border-white/[0.08] bg-[#151d27] px-3 pr-9 text-[14px] font-semibold text-[#e8eaed] outline-none focus:border-ember'

export function DocumentsPage() {
	const { data: attachments, dataUpdatedAt, isLoading } = useAttachments()
	const { data: devices } = useDevices()
	const processReady = useProcessReadyAttachments()
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState<DocumentCategory | 'all'>('all')
	const [status, setStatus] = useState<IngestionStatus | 'all'>('all')
	const [model, setModel] = useState('all')

	const attachmentDeviceQueries = useQueries({
		queries: (attachments ?? []).map((attachment) => ({
			queryKey: ['attachments', attachment.id, 'devices'],
			queryFn: () => api.get<Device[]>(`/api/attachments/${attachment.id}/devices`),
		})),
	})

	const devicesByAttachment = useMemo(() => {
		const result = new Map<number, Device[] | undefined>()
		attachments?.forEach((attachment, index) =>
			result.set(attachment.id, attachmentDeviceQueries[index]?.data),
		)
		return result
	}, [attachmentDeviceQueries, attachments])

	const filtered = useMemo(() => {
		if (!attachments) return []
		const query = search.trim().toLocaleLowerCase('pl-PL')
		return attachments.filter((attachment) => {
			const linkedDevices = devicesByAttachment.get(attachment.id)
			const documentCategory = getDocumentCategory(attachment.original_filename)
			const matchesSearch =
				query.length === 0 ||
				[
					attachment.original_filename,
					documentCategory,
					...(linkedDevices?.map((device) => device.name) ?? []),
				].some((value) => value.toLocaleLowerCase('pl-PL').includes(query))
			const matchesCategory = category === 'all' || documentCategory === category
			const matchesStatus = status === 'all' || attachment.ingest_status === status
			const matchesModel =
				model === 'all' ||
				linkedDevices?.some((device) => String(device.id) === model) === true
			return matchesSearch && matchesCategory && matchesStatus && matchesModel
		})
	}, [attachments, category, devicesByAttachment, model, search, status])

	const readyAttachments = (attachments ?? []).filter((attachment) =>
		canProcess(attachment.ingest_status),
	)
	const succeededCount = (attachments ?? []).filter(
		(attachment) => attachment.ingest_status === 'succeeded',
	).length
	const failedCount = (attachments ?? []).filter(
		(attachment) => attachment.ingest_status === 'failed',
	).length
	const unassignedCount = (attachments ?? []).filter(
		(attachment) => devicesByAttachment.get(attachment.id)?.length === 0,
	).length

	return (
		<div className='-m-8 min-h-screen bg-[#0d141c] bg-[radial-gradient(circle_at_top_right,rgba(255,122,0,0.12),transparent_35%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px] px-[34px] pt-[36px] pb-12 text-[#e8eaed]'>
			<header className='mb-7 rounded-md border-l-2 border-l-ember bg-gradient-to-r from-ember/[0.07] via-ember/[0.015] to-transparent py-1 pr-1 pl-4'>
				<h1 className='text-[44px] leading-[52px] font-black tracking-tight'>
					Baza wiedzy
				</h1>
				<p className='mt-0.5 text-base font-medium text-[#9aa4b2]'>
					Dokumenty, z których korzysta Asystent Serwisanta.
				</p>
				<p className='mt-3 text-[13px] font-semibold text-[#9aa4b2]'>
					Ostatnia synchronizacja:{' '}
					<span className='text-[#e8eaed]'>{formatSyncTime(dataUpdatedAt)}</span> ·{' '}
					<span className='text-[#e8eaed]'>{attachments?.length ?? 0}</span>{' '}
					{pluralizePl(attachments?.length ?? 0, 'plik', 'pliki', 'plików')} ·{' '}
					<span className='text-[#e8eaed]'>
						{machineCountLabel(devices?.length ?? 0)}
					</span>
				</p>
			</header>

			<section className='mb-16 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'>
				<StatCard
					label='Dokumenty'
					value={attachments?.length ?? 0}
					detail='plików w bazie'
					icon={FileCog}
					accent='bg-sky-300'
					iconClassName='text-sky-300'
				/>
				<StatCard
					label='Gotowe do użycia'
					value={succeededCount}
					detail='dostępne dla asystenta'
					icon={Workflow}
					accent='bg-emerald-400'
					iconClassName='text-emerald-400'
				/>
				<StatCard
					label='Wymagają uwagi'
					value={failedCount}
					detail='błędów importu'
					detailClassName={failedCount > 0 ? 'text-[#ff921f]' : 'text-[#9aa4b2]'}
					icon={ShieldAlert}
					accent='bg-orange-500'
					iconClassName='text-orange-500'
				/>
				<StatCard
					label='Nieprzypisane'
					value={unassignedCount}
					detail='bez maszyny'
					detailClassName={unassignedCount > 0 ? 'text-red-300' : 'text-[#9aa4b2]'}
					icon={ScrollText}
					accent='bg-red-400'
					iconClassName='text-red-400'
				/>
			</section>

			<section>
				<div className='mb-[14px] flex items-end justify-between gap-5'>
					<div>
						<h2 className='text-2xl font-extrabold'>Dokumenty</h2>
						<p className='mt-1 text-[13px] font-semibold text-[#9aa4b2]'>
							Lista plików dostępnych dla Asystenta Serwisanta.
						</p>
					</div>
					<div className='flex items-center gap-3'>
						{readyAttachments.length > 0 && (
							<button
								type='button'
								disabled={processReady.isPending}
								onClick={() => processReady.mutate(readyAttachments)}
								className='flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.1] bg-[#151d27] px-[18px] text-xs font-extrabold hover:border-ember disabled:cursor-not-allowed disabled:opacity-40'>
								<Play size={17} />
								{processReady.isPending
									? 'Przetwarzanie…'
									: `Przetwórz oczekujące (${readyAttachments.length})`}
							</button>
						)}
						<Link
							to='/add-document'
							className='flex h-10 items-center justify-center rounded-lg bg-[#ff7a00] px-[18px] text-xs font-extrabold text-[#111820] hover:bg-[#ff921f]'>
							<Plus size={18} className='mr-2' strokeWidth={2.4} />
							Dodaj dokument
						</Link>
					</div>
				</div>

				<div className='flex min-w-[920px] items-center gap-3 border-b border-white/[0.08] pb-4'>
					<label className='flex h-[46px] min-w-[320px] flex-1 items-center rounded-md border border-white/[0.08] bg-[#151d27] px-3'>
						<Search size={18} className='shrink-0 text-ember' strokeWidth={2.4} />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder='Szukaj po nazwie, maszynie, typie…'
							className='ml-3 h-10 w-full bg-transparent text-[15px] font-medium text-[#e8eaed] outline-none placeholder:text-[#6f7a88]'
						/>
					</label>
					<FilterSelect label='Typ dokumentu'>
						<select
							value={category}
							onChange={(event) =>
								setCategory(event.target.value as DocumentCategory | 'all')
							}
							className={selectClassName}>
							<option value='all'>Typ: wszystkie</option>
							<option value='Instrukcja'>Instrukcja</option>
							<option value='Kody błędów'>Kody błędów</option>
							<option value='Schemat'>Schemat</option>
							<option value='Biuletyn'>Biuletyn</option>
							<option value='Dokument'>Dokument</option>
						</select>
					</FilterSelect>
					<FilterSelect label='Status importu'>
						<select
							value={status}
							onChange={(event) =>
								setStatus(event.target.value as IngestionStatus | 'all')
							}
							className={selectClassName}>
							<option value='all'>Status: wszystkie</option>
							{Object.entries(INGESTION_STATUS_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</FilterSelect>
					<FilterSelect label='Maszyna'>
						<select
							value={model}
							onChange={(event) => setModel(event.target.value)}
							className={selectClassName}>
							<option value='all'>Maszyna: wszystkie</option>
							{devices?.map((device) => (
								<option key={device.id} value={device.id}>
									{device.name}
								</option>
							))}
						</select>
					</FilterSelect>
				</div>

				<div className='min-w-[1250px]'>
					<div className='grid h-16 grid-cols-[minmax(320px,2.35fr)_minmax(130px,.75fr)_minmax(220px,1.35fr)_minmax(170px,.82fr)_minmax(190px,1.28fr)] items-center border-b border-white/[0.08] px-4 text-[13px] font-black tracking-[1.1px] text-[#9aa4b2] uppercase'>
						<span className='pl-[63px]'>Dokument</span>
						<span>Typ</span>
						<span>Powiązane maszyny</span>
						<span>Stan importu</span>
						<span>Dodano</span>
					</div>
					{isLoading && (
						<div className='border-b border-white/[0.08] px-6 py-8 text-sm text-[#9aa4b2]'>
							Ładowanie dokumentów…
						</div>
					)}
					{!isLoading && filtered.length === 0 && (
						<div className='border-b border-white/[0.08] px-6 py-8 text-sm text-[#9aa4b2]'>
							Brak dokumentów do wyświetlenia.
						</div>
					)}
					{filtered.map((attachment) => (
						<DocumentRow
							key={attachment.id}
							attachment={attachment}
							devices={devicesByAttachment.get(attachment.id)}
						/>
					))}
				</div>
			</section>
		</div>
	)
}
