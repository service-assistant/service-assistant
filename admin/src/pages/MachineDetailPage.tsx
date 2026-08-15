import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { useAttachments, useLinkDevice, useUnlinkDevice } from '@/hooks/useAttachments'
import { useCategoryTree } from '@/hooks/useCategories'
import { useDeleteDevice, useDevice, useDeviceAttachments } from '@/hooks/useDevices'
import { categoryPath, flattenCategoryTree } from '@/lib/categoryTree'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'

export function MachineDetailPage() {
	const { deviceId } = useParams({ strict: false }) as { deviceId: string }
	const id = Number(deviceId)
	const navigate = useNavigate()

	const { data: device, isLoading } = useDevice(id)
	const { data: tree } = useCategoryTree()
	const { data: linkedAttachments } = useDeviceAttachments(id)
	const { data: allAttachments } = useAttachments()
	const deleteDevice = useDeleteDevice()
	const linkDevice = useLinkDevice()
	const unlinkDevice = useUnlinkDevice()

	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [showAssignPanel, setShowAssignPanel] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const flat = flattenCategoryTree(tree ?? [])
	const linkedIds = new Set(linkedAttachments?.map((a) => a.id))

	async function handleDelete() {
		try {
			await deleteDevice.mutateAsync(id)
			void navigate({ to: '/catalog', search: { tab: 'models' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się usunąć maszyny.')
			setShowDeleteModal(false)
		}
	}

	async function toggleAttachment(attachmentId: number, linked: boolean) {
		if (linked) {
			await unlinkDevice.mutateAsync({ attachmentId, deviceId: id })
		} else {
			await linkDevice.mutateAsync({ attachmentId, deviceId: id })
		}
	}

	if (isLoading || !device) return <div className='text-cream/50'>Ładowanie…</div>

	return (
		<div className='mx-auto max-w-3xl'>
			<Link
				to='/catalog'
				search={{ tab: 'models' }}
				className='mb-4 inline-block text-sm text-cream/60 hover:text-cream'>
				← Wróć do katalogu
			</Link>

			<div className='mb-6 flex items-center gap-4'>
				{device.image_url && (
					<img
						src={device.image_url}
						alt=''
						className='size-20 rounded-lg border border-line object-contain'
					/>
				)}
				<div>
					<h1 className='text-2xl font-semibold text-cream'>{device.name}</h1>
					<p className='text-sm text-cream/50'>
						{categoryPath(device.category_id, flat)}
					</p>
				</div>
				<Link
					to='/add-document'
					className='ml-auto rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink'>
					Dodaj dokument
				</Link>
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<h2 className='mb-3 text-sm font-medium text-cream'>Informacje techniczne</h2>
				<dl className='grid grid-cols-2 gap-y-2 text-sm'>
					<dt className='text-cream/50'>Kod modelu</dt>
					<dd className='text-cream/80'>{device.model_serial_code ?? '—'}</dd>
					<dt className='text-cream/50'>Utworzono</dt>
					<dd className='text-cream/80'>
						{new Date(device.created_at).toLocaleDateString('pl-PL')}
					</dd>
				</dl>
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<div className='mb-3 flex items-center justify-between'>
					<h2 className='text-sm font-medium text-cream'>
						Dokumentacja ({linkedAttachments?.length ?? 0})
					</h2>
					<button
						onClick={() => setShowAssignPanel((v) => !v)}
						className='text-sm text-ember hover:underline'>
						{showAssignPanel ? 'Zamknij' : 'Zmień'}
					</button>
				</div>

				{!showAssignPanel && (
					<div className='space-y-1'>
						{(linkedAttachments?.length ?? 0) === 0 && (
							<p className='text-sm text-cream/50'>Brak przypisanych dokumentów.</p>
						)}
						{linkedAttachments?.map((attachment) => (
							<Link
								key={attachment.id}
								to='/documents/$attachmentId'
								params={{ attachmentId: String(attachment.id) }}
								className='block rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft hover:text-cream'>
								{attachment.original_filename}
							</Link>
						))}
					</div>
				)}

				{showAssignPanel && (
					<div className='max-h-80 space-y-1 overflow-y-auto'>
						{allAttachments?.map((attachment) => {
							const linked = linkedIds.has(attachment.id)
							return (
								<label
									key={attachment.id}
									className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft'>
									<input
										type='checkbox'
										checked={linked}
										onChange={() =>
											void toggleAttachment(attachment.id, linked)
										}
									/>
									{attachment.original_filename}
								</label>
							)
						})}
					</div>
				)}
			</div>

			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}

			<div className='rounded-lg border border-red-900/40 bg-panel p-6'>
				<h2 className='mb-2 text-sm font-medium text-red-300'>Strefa niebezpieczna</h2>
				<p className='mb-3 text-sm text-cream/50'>Usunięcie maszyny jest nieodwracalne.</p>
				<button
					onClick={() => setShowDeleteModal(true)}
					className='rounded-md border border-red-700 px-4 py-2 text-sm text-red-300 hover:bg-red-900/20'>
					Usuń maszynę
				</button>
			</div>

			{showDeleteModal && (
				<ConfirmDeleteModal
					title='Usuń maszynę'
					description={`Maszyna "${device.name}" zostanie trwale usunięta.`}
					pending={deleteDevice.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
		</div>
	)
}
