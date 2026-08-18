import { ConfirmModal } from '@/components/ConfirmModal'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useAttachmentDevices, useAttachments } from '@/hooks/useAttachments'
import { useDevices } from '@/hooks/useDevices'
import { useProcessReadyAttachments, useStartIngestion } from '@/hooks/useIngestions'
import {
	DOCUMENT_CATEGORY_BADGE_CLASSES,
	DOCUMENT_CATEGORY_ICON_CLASSES,
	getDocumentCategory,
	type DocumentCategory,
} from '@/lib/documentCategory'
import {
	INGESTION_STATUS_BADGE_CLASSES,
	INGESTION_STATUS_LABELS,
	canProcess,
	canRetry,
} from '@/lib/ingestion'
import type { Attachment, IngestionStatus } from '@/lib/types'
import { Link } from '@tanstack/react-router'
import {
	Calendar,
	FileStack,
	Play,
	Plus,
	RotateCcw,
	Search,
	ShieldAlert,
	ShieldCheck,
} from 'lucide-react'
import { useMemo, useState } from 'react'

function DocumentRow({ attachment }: { attachment: Attachment }) {
	const { data: devices } = useAttachmentDevices(attachment.id)
	const startIngestion = useStartIngestion()
	const category = getDocumentCategory(attachment.original_filename)
	const status = attachment.ingest_status
	const [confirmRetry, setConfirmRetry] = useState(false)

	return (
		<>
			<Link
				to='/documents/$attachmentId'
				params={{ attachmentId: String(attachment.id) }}
				className='grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0 hover:bg-panel-soft'>
				<span className='flex items-center gap-3 truncate text-cream'>
					<span
						className={`flex size-8 shrink-0 items-center justify-center rounded-md ${DOCUMENT_CATEGORY_ICON_CLASSES[category]}`}>
						{category === 'Kody błędów' ? (
							<ShieldAlert size={16} />
						) : (
							<FileStack size={16} />
						)}
					</span>
					<span className='truncate'>{attachment.original_filename}</span>
				</span>
				<span>
					<span
						className={`rounded-md px-2 py-0.5 text-xs font-semibold ${DOCUMENT_CATEGORY_BADGE_CLASSES[category]}`}>
						{category}
					</span>
				</span>
				<span className='truncate text-xs text-cream/60'>
					{devices === undefined
						? '…'
						: devices.length === 0
							? 'Brak przypisanych maszyn'
							: devices.length === 1
								? devices[0].name
								: `${devices.length} podłączonych maszyn`}
				</span>
				<span className='text-xs'>
					<span
						className={`rounded-full px-2 py-0.5 ${INGESTION_STATUS_BADGE_CLASSES[status]}`}>
						{INGESTION_STATUS_LABELS[status]}
					</span>
				</span>
				<span className='flex items-center gap-1.5 text-xs text-cream/50'>
					<Calendar size={12} className='text-ember' />
					{new Date(attachment.created_at).toLocaleDateString('pl-PL')}
				</span>
				<span>
					{canProcess(status) && (
						<button
							title='Przetwórz'
							disabled={startIngestion.isPending}
							onClick={(e) => {
								e.preventDefault()
								e.stopPropagation()
								startIngestion.mutate(attachment.id)
							}}
							className='cursor-pointer rounded p-1 text-cream/50 hover:text-cream disabled:cursor-not-allowed disabled:opacity-40'>
							<Play size={14} />
						</button>
					)}
					{canRetry(status) && (
						<button
							title='Ponów'
							disabled={startIngestion.isPending}
							onClick={(e) => {
								e.preventDefault()
								e.stopPropagation()
								setConfirmRetry(true)
							}}
							className='cursor-pointer rounded p-1 text-cream/50 hover:text-cream disabled:cursor-not-allowed disabled:opacity-40'>
							<RotateCcw size={14} />
						</button>
					)}
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

export function DocumentsPage() {
	const { data: attachments, isLoading } = useAttachments()
	const { data: devices } = useDevices()
	const processReady = useProcessReadyAttachments()
	const [search, setSearch] = useState('')
	const [category, setCategory] = useState<DocumentCategory | 'all'>('all')
	const [status, setStatus] = useState<IngestionStatus | 'all'>('all')

	const filtered = useMemo(() => {
		if (!attachments) return []
		return attachments.filter((a) => {
			const matchesSearch = a.original_filename.toLowerCase().includes(search.toLowerCase())
			const matchesCategory =
				category === 'all' || getDocumentCategory(a.original_filename) === category
			const matchesStatus = status === 'all' || a.ingest_status === status
			return matchesSearch && matchesCategory && matchesStatus
		})
	}, [attachments, search, category, status])

	const readyAttachments = (attachments ?? []).filter((a) => canProcess(a.ingest_status))
	const readyCount = (attachments ?? []).filter((a) => a.ingest_status === 'succeeded').length
	const failedCount = (attachments ?? []).filter((a) => a.ingest_status === 'failed').length

	return (
		<div>
			<PageHeader
				title='Baza wiedzy'
				subtitle='Dokumenty, z których korzysta Asystent Serwisanta.'
				meta={
					<>
						{attachments?.length ?? 0} plików · {devices?.length ?? 0} maszyn
					</>
				}
			/>

			<div className='mb-6 grid grid-cols-4 gap-4'>
				<StatTile
					label='Dokumenty'
					value={attachments?.length ?? 0}
					sublabel='plików w bazie'
					icon={FileStack}
					color='blue'
				/>
				<StatTile
					label='Gotowe do użycia'
					value={readyCount}
					sublabel='dostępne dla asystenta'
					icon={ShieldCheck}
					color='green'
				/>
				<StatTile
					label='Wymagają uwagi'
					value={failedCount}
					sublabel='błędów importu'
					icon={ShieldAlert}
					color='orange'
				/>
				<StatTile
					label='Oczekuje na przetworzenie'
					value={readyAttachments.length}
					sublabel='wymaga uruchomienia'
					icon={FileStack}
					color='red'
				/>
			</div>

			<div className='mb-6 flex items-center justify-between'>
				<div>
					<h2 className='text-xl font-bold text-cream'>Dokumenty</h2>
					<p className='mt-1 text-sm text-cream/50'>
						Lista plików dostępnych dla Asystenta Serwisanta.
					</p>
				</div>
				<div className='flex items-center gap-3'>
					{readyAttachments.length > 0 && (
						<div className='flex flex-col items-end gap-1'>
							<button
								title='Przetwarzanie działa w tle — możesz zamknąć tę kartę.'
								disabled={processReady.isPending}
								onClick={() => processReady.mutate(readyAttachments)}
								className='flex cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-cream hover:border-ember disabled:cursor-not-allowed disabled:opacity-40'>
								<Play size={16} />
								{processReady.isPending
									? 'Przetwarzanie…'
									: `Przetwórz oczekujące (${readyAttachments.length})`}
							</button>
							<span className='text-xs text-cream/40'>
								Działa w tle — możesz zamknąć kartę
							</span>
						</div>
					)}
					<Link
						to='/add-document'
						className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
						<Plus size={16} />
						Dodaj dokument
					</Link>
				</div>
			</div>

			<div className='mb-4 flex gap-3'>
				<div className='flex flex-1 items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
					<Search size={16} className='text-cream/40' />
					<input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder='Szukaj po nazwie, modelu, typie…'
						className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
					/>
				</div>
				<select
					value={category}
					onChange={(e) => setCategory(e.target.value as DocumentCategory | 'all')}
					className='rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream'>
					<option value='all'>Typ: wszystkie</option>
					<option value='Instrukcja'>Instrukcja</option>
					<option value='Kody błędów'>Kody błędów</option>
					<option value='Schemat'>Schemat</option>
					<option value='Biuletyn'>Biuletyn</option>
					<option value='Dokument'>Dokument</option>
				</select>
				<select
					value={status}
					onChange={(e) => setStatus(e.target.value as IngestionStatus | 'all')}
					className='rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream'>
					<option value='all'>Status: wszystkie</option>
					{Object.entries(INGESTION_STATUS_LABELS).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
				<select className='rounded-md border border-line bg-panel px-3 py-2 text-sm text-cream'>
					<option>Model: wszystkie</option>
					{devices?.map((d) => (
						<option key={d.id}>{d.name}</option>
					))}
				</select>
			</div>

			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr_2fr_1fr_1fr_auto] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Dokument</span>
					<span>Typ</span>
					<span>Powiązane maszyny</span>
					<span>Stan importu</span>
					<span>Dodano</span>
					<span></span>
				</div>
				{isLoading && <div className='px-4 py-6 text-sm text-cream/50'>Ładowanie…</div>}
				{!isLoading && filtered.length === 0 && (
					<div className='px-4 py-6 text-sm text-cream/50'>Brak dokumentów.</div>
				)}
				{filtered.map((attachment) => (
					<DocumentRow key={attachment.id} attachment={attachment} />
				))}
			</div>
		</div>
	)
}
