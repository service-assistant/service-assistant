import { ConfirmModal } from '@/components/ConfirmModal'
import { useAttachments } from '@/hooks/useAttachments'
import { useCancelIngestion, useStartIngestion } from '@/hooks/useIngestions'
import {
	INGESTION_STATUS_BADGE_CLASSES,
	INGESTION_STATUS_LABELS,
	canCancel,
	progressPercent,
	touchedAttachments,
} from '@/lib/ingestion'
import type { Attachment, IngestionStatus } from '@/lib/types'
import { Link } from '@tanstack/react-router'
import { FileText, Loader2, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type QueueFilter = 'all' | 'active' | 'succeeded' | 'failed'

const FILTERS: { label: string; value: QueueFilter }[] = [
	{ label: 'Wszystkie', value: 'all' },
	{ label: 'Przetwarzane', value: 'active' },
	{ label: 'Gotowe', value: 'succeeded' },
	{ label: 'Błędy', value: 'failed' },
]

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

function shortError(value: string | null): string {
	if (!value) return 'Nieznany błąd przetwarzania'
	const firstLine = value.split(/\r?\n/, 1)[0].trim()
	return firstLine.length > 110 ? `${firstLine.slice(0, 107)}…` : firstLine
}

function progressLabel(attachment: Attachment): string {
	if (attachment.ingest_status === 'queued') return 'Oczekuje na rozpoczęcie'
	if (attachment.ingest_pages_total <= 0) {
		return attachment.ingest_status === 'running' ? 'Otwieranie pliku…' : 'Brak danych'
	}
	return `${attachment.ingest_pages_done} / ${attachment.ingest_pages_total} stron`
}

function QueueRow({ attachment }: { attachment: Attachment }) {
	const cancel = useCancelIngestion()
	const retry = useStartIngestion()
	const [confirmRetry, setConfirmRetry] = useState(false)
	const [cancelRequested, setCancelRequested] = useState(false)
	const percent = progressPercent(attachment)
	const pending = cancel.isPending || retry.isPending

	useEffect(() => {
		if (!canCancel(attachment.ingest_status)) setCancelRequested(false)
	}, [attachment.ingest_status])

	return (
		<>
			<div
				className={`group relative grid min-h-[88px] grid-cols-[minmax(280px,2fr)_minmax(150px,.85fr)_minmax(210px,1.15fr)_minmax(170px,.85fr)_minmax(130px,.65fr)] items-center border border-transparent border-b-white/[0.08] px-4 text-sm transition-colors hover:rounded-md hover:border-white/[0.08] hover:border-l-ember hover:bg-[#1b2633] ${attachment.ingest_status === 'failed' ? 'border-l-4 border-l-red-400' : ''}`}>
				<div className='flex min-w-0 items-center'>
					<span className='flex size-[46px] shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-[#151d27] text-sky-300'>
						<FileText size={24} strokeWidth={2.3} />
					</span>
					<span className='ml-[17px] truncate text-[15px] font-semibold text-[#e8eaed]'>
						{attachment.original_filename}
					</span>
				</div>
				<div>
					<span
						className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${INGESTION_STATUS_BADGE_CLASSES[attachment.ingest_status]}`}>
						{cancelRequested
							? 'Anulowanie…'
							: INGESTION_STATUS_LABELS[attachment.ingest_status]}
					</span>
					{attachment.ingest_status === 'failed' && (
						<p
							className='mt-1 max-w-[220px] truncate text-xs text-red-300'
							title={shortError(attachment.ingest_error)}>
							{shortError(attachment.ingest_error)}
						</p>
					)}
				</div>
				<div className='pr-8'>
					<p className='text-[13px] font-semibold text-[#9aa4b2]'>
						{progressLabel(attachment)}
					</p>
					{attachment.ingest_status === 'running' && (
						<div className='mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]'>
							<div
								className='h-full rounded-full bg-sky-400 transition-[width] duration-500'
								style={{ width: `${percent}%` }}
							/>
						</div>
					)}
				</div>
				<span className='text-[13px] font-medium text-[#9aa4b2]'>
					{formatDate(attachment.created_at)}
				</span>
				<div className='flex items-center gap-2'>
					{attachment.ingest_status === 'succeeded' && (
						<Link
							to='/documents/$attachmentId'
							params={{ attachmentId: String(attachment.id) }}
							className='text-xs font-extrabold text-[#ff921f] hover:text-[#ffad55]'>
							Otwórz
						</Link>
					)}
					{attachment.ingest_status === 'failed' && (
						<button
							type='button'
							disabled={pending}
							onClick={() => setConfirmRetry(true)}
							className='flex cursor-pointer items-center gap-1.5 text-xs font-extrabold text-[#ff921f] hover:text-[#ffad55] disabled:cursor-not-allowed disabled:opacity-40'>
							<RotateCcw size={14} /> Ponów
						</button>
					)}
					{canCancel(attachment.ingest_status) && (
						<button
							type='button'
							disabled={pending || cancelRequested}
							onClick={() => {
								setCancelRequested(true)
								cancel.mutate(attachment.id, {
									onError: () => setCancelRequested(false),
								})
							}}
							className='flex cursor-pointer items-center gap-1.5 text-xs font-extrabold text-[#9aa4b2] hover:text-[#e8eaed] disabled:cursor-not-allowed disabled:opacity-40'>
							{cancelRequested ? (
								<Loader2 size={14} className='animate-spin' />
							) : (
								<X size={14} />
							)}
							Anuluj
						</button>
					)}
				</div>
			</div>

			{confirmRetry && (
				<ConfirmModal
					title='Ponów przetwarzanie'
					description={`Dokument "${attachment.original_filename}" zostanie przetworzony ponownie. Obecnie zaindeksowane fragmenty zostaną usunięte i zastąpione nowymi.`}
					confirmLabel='Ponów'
					pendingLabel='Uruchamianie…'
					pending={retry.isPending}
					onConfirm={() => {
						retry.mutate(attachment.id)
						setConfirmRetry(false)
					}}
					onClose={() => setConfirmRetry(false)}
				/>
			)}
		</>
	)
}

function matchesFilter(status: IngestionStatus, filter: QueueFilter): boolean {
	if (filter === 'all') return true
	if (filter === 'active') return status === 'queued' || status === 'running'
	return status === filter
}

export function QueuePage() {
	const { data: attachments, isLoading } = useAttachments()
	const [filter, setFilter] = useState<QueueFilter>('all')
	const ingestions = useMemo(() => touchedAttachments(attachments ?? []), [attachments])
	const filtered = ingestions.filter((attachment) =>
		matchesFilter(attachment.ingest_status, filter),
	)

	return (
		<div className='-m-8 min-h-screen bg-[#0d141c] bg-[radial-gradient(circle_at_top_right,rgba(255,122,0,0.12),transparent_35%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px] px-[34px] pt-[36px] pb-12 text-[#e8eaed]'>
			<header className='mb-10 rounded-md border-l-2 border-l-ember bg-gradient-to-r from-ember/[0.07] via-ember/[0.015] to-transparent py-1 pr-1 pl-4'>
				<h1 className='text-[44px] leading-[52px] font-black tracking-tight'>
					Kolejka przetwarzania
				</h1>
				<p className='mt-0.5 text-base font-medium text-[#9aa4b2]'>
					Status dokumentów dodawanych do bazy wiedzy.
				</p>
			</header>

			<section>
				<div className='mb-5 flex flex-wrap items-end justify-between gap-4'>
					<div>
						<h2 className='text-2xl font-extrabold'>Dokumenty</h2>
						<p className='mt-1 text-[13px] font-semibold text-[#9aa4b2]'>
							Statusy odświeżają się automatycznie podczas przetwarzania.
						</p>
					</div>
					<div className='inline-flex rounded-md border border-white/[0.08] bg-[#151d27] p-1'>
						{FILTERS.map((item) => (
							<button
								key={item.value}
								type='button'
								onClick={() => setFilter(item.value)}
								className={`cursor-pointer rounded px-3.5 py-2 text-xs font-extrabold transition-colors ${filter === item.value ? 'bg-[#ff7a00] text-[#111820]' : 'text-[#9aa4b2] hover:text-[#e8eaed]'}`}>
								{item.label}
							</button>
						))}
					</div>
				</div>

				<div className='overflow-x-auto'>
					<div className='min-w-[940px]'>
						<div className='grid h-16 grid-cols-[minmax(280px,2fr)_minmax(150px,.85fr)_minmax(210px,1.15fr)_minmax(170px,.85fr)_minmax(130px,.65fr)] items-center border-b border-white/[0.08] px-4 text-[13px] font-black tracking-[1.1px] text-[#9aa4b2] uppercase'>
							<span className='pl-[63px]'>Dokument</span>
							<span>Status</span>
							<span>Postęp</span>
							<span>Dodano</span>
							<span>Akcje</span>
						</div>
						{isLoading && (
							<div className='border-b border-white/[0.08] px-6 py-8 text-sm text-[#9aa4b2]'>
								Ładowanie kolejki…
							</div>
						)}
						{!isLoading && filtered.length === 0 && (
							<div className='border-b border-white/[0.08] px-6 py-8 text-sm text-[#9aa4b2]'>
								Brak dokumentów pasujących do wybranego filtra.
							</div>
						)}
						{filtered.map((attachment) => (
							<QueueRow key={attachment.id} attachment={attachment} />
						))}
					</div>
				</div>
			</section>
		</div>
	)
}
