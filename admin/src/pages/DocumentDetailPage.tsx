import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import {
	attachmentFileUrl,
	useAttachment,
	useAttachmentDevices,
	useDeleteAttachment,
	useLinkDevice,
	useUnlinkDevice,
} from '@/hooks/useAttachments'
import { useDevices } from '@/hooks/useDevices'
import { getDocumentCategory } from '@/lib/documentCategory'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
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

	const [showDeleteModal, setShowDeleteModal] = useState(false)
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
				</dl>
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
		</div>
	)
}
