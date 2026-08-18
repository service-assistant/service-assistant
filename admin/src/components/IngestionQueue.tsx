import { ConfirmModal } from '@/components/ConfirmModal'
import { useAttachments } from '@/hooks/useAttachments'
import { useCancelIngestion, useStartIngestion } from '@/hooks/useIngestions'
import {
	INGESTION_STATUS_BADGE_CLASSES,
	INGESTION_STATUS_LABELS,
	activeCount,
	canCancel,
	canRetry,
	progressPercent,
	statusDetail,
	touchedAttachments,
} from '@/lib/ingestion'
import type { Attachment } from '@/lib/types'
import { Layers, Loader2, RotateCcw, X } from 'lucide-react'
import { useEffect, useState } from 'react'

function IngestionRow({ ingestion }: { ingestion: Attachment }) {
	const cancel = useCancelIngestion()
	const retry = useStartIngestion()
	const pending = cancel.isPending || retry.isPending
	const percent = progressPercent(ingestion)
	const detail = statusDetail(ingestion)
	const [confirmRetry, setConfirmRetry] = useState(false)
	const [cancelRequested, setCancelRequested] = useState(false)

	// A cancel on a running job only *requests* an abort — the worker honors
	// it on its own schedule (next page boundary), so `ingest_status` doesn't
	// flip right away. Keep showing "cancelling" until it actually leaves the
	// active states, instead of reverting to a normal "running" look the
	// instant the POST request settles.
	useEffect(() => {
		if (!canCancel(ingestion.ingest_status)) setCancelRequested(false)
	}, [ingestion.ingest_status])

	function handleCancel() {
		setCancelRequested(true)
		cancel.mutate(ingestion.id, { onError: () => setCancelRequested(false) })
	}

	return (
		<li className='border-b border-line px-4 py-3 last:border-b-0'>
			<div className='flex items-start justify-between gap-2'>
				<div className='min-w-0'>
					<p className='truncate text-sm font-medium text-cream'>
						{ingestion.original_filename}
					</p>
					{cancelRequested ? (
						<p className='mt-0.5 truncate text-xs text-cream/50'>Anulowanie…</p>
					) : (
						detail && <p className='mt-0.5 truncate text-xs text-cream/50'>{detail}</p>
					)}
				</div>
				<div className='flex shrink-0 items-center gap-1'>
					<span
						className={
							cancelRequested
								? 'rounded-full border border-cream/20 bg-cream/5 px-2 py-0.5 text-[11px] text-cream/60'
								: `rounded-full px-2 py-0.5 text-[11px] ${INGESTION_STATUS_BADGE_CLASSES[ingestion.ingest_status]}`
						}>
						{cancelRequested
							? 'Anulowanie…'
							: INGESTION_STATUS_LABELS[ingestion.ingest_status]}
					</span>
					{canCancel(ingestion.ingest_status) && (
						<button
							title='Anuluj'
							disabled={pending || cancelRequested}
							onClick={handleCancel}
							className='cursor-pointer rounded p-1 text-cream/50 hover:text-cream disabled:cursor-not-allowed disabled:opacity-40'>
							{cancelRequested ? (
								<Loader2 size={14} className='animate-spin' />
							) : (
								<X size={14} />
							)}
						</button>
					)}
					{canRetry(ingestion.ingest_status) && (
						<button
							title='Ponów'
							disabled={pending}
							onClick={() => setConfirmRetry(true)}
							className='cursor-pointer rounded p-1 text-cream/50 hover:text-cream disabled:cursor-not-allowed disabled:opacity-40'>
							<RotateCcw size={14} />
						</button>
					)}
				</div>
			</div>

			{ingestion.ingest_status === 'running' && (
				<div className='mt-2 h-1 w-full overflow-hidden rounded-full bg-cream/10'>
					<div
						className='h-full rounded-full bg-ember transition-[width] duration-500'
						style={{ width: `${percent}%` }}
					/>
				</div>
			)}

			{confirmRetry && (
				<ConfirmModal
					title='Ponów przetwarzanie'
					description={`Dokument "${ingestion.original_filename}" zostanie przetworzony ponownie. Obecnie zaindeksowane fragmenty zostaną usunięte i zastąpione nowymi.`}
					confirmLabel='Ponów'
					pendingLabel='Uruchamianie…'
					pending={retry.isPending}
					onConfirm={() => {
						retry.mutate(ingestion.id)
						setConfirmRetry(false)
					}}
					onClose={() => setConfirmRetry(false)}
				/>
			)}
		</li>
	)
}

/**
 * Floating queue widget: a badge in the bottom-right corner that opens a panel
 * listing recent ingestion jobs with their progress, cancel and retry actions.
 */
export function IngestionQueue() {
	const [open, setOpen] = useState(false)
	const { data: attachments } = useAttachments()
	const ingestions = touchedAttachments(attachments ?? [])

	if (!attachments || ingestions.length === 0) return null

	const active = activeCount(ingestions)

	return (
		<div className='fixed right-6 bottom-6 z-50 flex flex-col items-end gap-2'>
			{open && (
				<div className='w-96 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-line bg-panel shadow-xl'>
					<div className='flex items-center justify-between border-b border-line px-4 py-3'>
						<h3 className='text-sm font-semibold text-cream'>Kolejka przetwarzania</h3>
						<button
							onClick={() => setOpen(false)}
							className='cursor-pointer rounded p-1 text-cream/50 hover:text-cream'>
							<X size={16} />
						</button>
					</div>
					<ul className='max-h-96 overflow-y-auto'>
						{ingestions.map((ingestion) => (
							<IngestionRow key={ingestion.id} ingestion={ingestion} />
						))}
					</ul>
				</div>
			)}

			<button
				onClick={() => setOpen((value) => !value)}
				className='flex items-center gap-2 rounded-full border border-line bg-panel px-4 py-2.5 text-sm text-cream shadow-lg hover:border-ember cursor-pointer'>
				{active > 0 ? (
					<Loader2 size={16} className='animate-spin text-ember' />
				) : (
					<Layers size={16} className='text-cream/60' />
				)}
				Kolejka
				{active > 0 && (
					<span className='rounded-full bg-ember px-1.5 text-xs font-semibold text-ink'>
						{active}
					</span>
				)}
			</button>
		</div>
	)
}
