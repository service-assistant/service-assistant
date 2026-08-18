import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { ConfirmModal } from '@/components/ConfirmModal'
import {
	attachmentFileUrl,
	useAttachment,
	useAttachmentDevices,
	useDeleteAttachment,
	useLinkDevice,
	useUnlinkDevice,
} from '@/hooks/useAttachments'
import { useDevices } from '@/hooks/useDevices'
import { useStartIngestion } from '@/hooks/useIngestions'
import { getDocumentCategory } from '@/lib/documentCategory'
import {
	INGESTION_STATUS_BADGE_CLASSES,
	INGESTION_STATUS_LABELS,
	canProcess,
	canRetry,
	statusDetail,
} from '@/lib/ingestion'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ExternalLink, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'

export function DocumentDetailPage() {
	const { attachmentId } = useParams({ strict: false }) as { attachmentId: string }
	const id = Number(attachmentId)
	const navigate = useNavigate()

	const { data: attachment, isLoading } = useAttachment(id)
	const { data: linkedDevices } = useAttachmentDevices(id)
	const { data: allDevices } = useDevices()
	const deleteAttachment = useDeleteAttachment()
	const linkDevice = useLinkDevice()
	const unlinkDevice = useUnlinkDevice()
	const startIngestion = useStartIngestion()

	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [showRetryModal, setShowRetryModal] = useState(false)
	const [showAssignPanel, setShowAssignPanel] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const linkedIds = new Set(linkedDevices?.map((d) => d.id))

	async function handleDelete() {
		try {
			await deleteAttachment.mutateAsync(id)
			void navigate({ to: '/' })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się usunąć dokumentu.')
			setShowDeleteModal(false)
		}
	}

	async function toggleDevice(deviceId: number, linked: boolean) {
		if (linked) {
			await unlinkDevice.mutateAsync({ attachmentId: id, deviceId })
		} else {
			await linkDevice.mutateAsync({ attachmentId: id, deviceId })
		}
	}

	if (isLoading || !attachment) return <div className='text-cream/50'>Ładowanie…</div>

	return (
		<div className='mx-auto max-w-3xl'>
			<Link to='/' className='mb-4 inline-block text-sm text-cream/60 hover:text-cream'>
				← Wróć do bazy wiedzy
			</Link>

			<div className='mb-6 flex items-center justify-between'>
				<h1 className='text-2xl font-semibold text-cream'>
					{attachment.original_filename}
				</h1>
				<a
					href={attachmentFileUrl(id)}
					target='_blank'
					rel='noreferrer'
					className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink'>
					<ExternalLink size={14} />
					Otwórz PDF
				</a>
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<h2 className='mb-3 text-sm font-medium text-cream'>Informacje o pliku</h2>
				<dl className='grid grid-cols-2 gap-y-2 text-sm'>
					<dt className='text-cream/50'>Kategoria</dt>
					<dd className='text-cream/80'>
						{getDocumentCategory(attachment.original_filename)}
					</dd>
					<dt className='text-cream/50'>Dodano</dt>
					<dd className='text-cream/80'>
						{new Date(attachment.created_at).toLocaleDateString('pl-PL')}
					</dd>
					<dt className='text-cream/50'>Stan importu</dt>
					<dd className='flex items-center gap-2'>
						<span
							className={`rounded-full px-2 py-0.5 text-xs ${INGESTION_STATUS_BADGE_CLASSES[attachment.ingest_status]}`}>
							{INGESTION_STATUS_LABELS[attachment.ingest_status]}
						</span>
						{statusDetail(attachment) && (
							<span className='text-xs text-cream/50'>
								{statusDetail(attachment)}
							</span>
						)}
					</dd>
				</dl>

				{canProcess(attachment.ingest_status) && (
					<button
						disabled={startIngestion.isPending}
						onClick={() => startIngestion.mutate(id)}
						className='mt-4 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-cream hover:border-ember disabled:cursor-not-allowed disabled:opacity-40'>
						<Play size={14} />
						{startIngestion.isPending ? 'Uruchamianie…' : 'Przetwórz'}
					</button>
				)}
				{canRetry(attachment.ingest_status) && (
					<button
						disabled={startIngestion.isPending}
						onClick={() => setShowRetryModal(true)}
						className='mt-4 flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-cream hover:border-ember disabled:cursor-not-allowed disabled:opacity-40'>
						<RotateCcw size={14} />
						{startIngestion.isPending ? 'Ponawianie…' : 'Ponów import'}
					</button>
				)}
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<div className='mb-3 flex items-center justify-between'>
					<h2 className='text-sm font-medium text-cream'>
						Powiązane maszyny ({linkedDevices?.length ?? 0})
					</h2>
					<button
						onClick={() => setShowAssignPanel((v) => !v)}
						className='text-sm text-ember hover:underline'>
						{showAssignPanel ? 'Zamknij' : 'Zmień'}
					</button>
				</div>

				{!showAssignPanel && (
					<div className='space-y-1'>
						{(linkedDevices?.length ?? 0) === 0 && (
							<p className='text-sm text-cream/50'>Brak powiązanych maszyn.</p>
						)}
						{linkedDevices?.map((device) => (
							<Link
								key={device.id}
								to='/machines/$deviceId'
								params={{ deviceId: String(device.id) }}
								className='block rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft hover:text-cream'>
								{device.name}
							</Link>
						))}
					</div>
				)}

				{showAssignPanel && (
					<div className='max-h-80 space-y-1 overflow-y-auto'>
						{allDevices?.map((device) => {
							const linked = linkedIds.has(device.id)
							return (
								<label
									key={device.id}
									className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft'>
									<input
										type='checkbox'
										checked={linked}
										onChange={() => void toggleDevice(device.id, linked)}
									/>
									{device.name}
								</label>
							)
						})}
					</div>
				)}
			</div>

			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}

			<div className='rounded-lg border border-red-900/40 bg-panel p-6'>
				<h2 className='mb-2 text-sm font-medium text-red-300'>Strefa niebezpieczna</h2>
				<p className='mb-3 text-sm text-cream/50'>
					Usunięcie dokumentu jest nieodwracalne.
				</p>
				<button
					onClick={() => setShowDeleteModal(true)}
					className='rounded-md border border-red-700 px-4 py-2 text-sm text-red-300 hover:bg-red-900/20'>
					Usuń dokument
				</button>
			</div>

			{showDeleteModal && (
				<ConfirmDeleteModal
					title='Usuń dokument'
					description={`Dokument "${attachment.original_filename}" zostanie trwale usunięty.`}
					pending={deleteAttachment.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}

			{showRetryModal && (
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
