import { useAttachments, useLinkDevice } from '@/hooks/useAttachments'
import { useBrands } from '@/hooks/useBrands'
import { useCreateDevice } from '@/hooks/useDevices'
import { useDeviceTypes } from '@/hooks/useDeviceTypes'
import { selectedLabel } from '@/lib/pluralize'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export function AddMachinePage() {
	const navigate = useNavigate()
	const { data: brands } = useBrands()
	const { data: deviceTypes } = useDeviceTypes()
	const { data: attachments } = useAttachments()
	const createDevice = useCreateDevice()
	const linkDevice = useLinkDevice()

	const [name, setName] = useState('')
	const [modelSerialCode, setModelSerialCode] = useState('')
	const [brandId, setBrandId] = useState<number | null>(null)
	const [deviceTypeId, setDeviceTypeId] = useState<number | null>(null)
	const [imageUrl, setImageUrl] = useState('')
	const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<number[]>([])
	const [error, setError] = useState<string | null>(null)

	function toggleAttachment(id: number) {
		setSelectedAttachmentIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		)
	}

	async function handleSubmit() {
		if (!name || !brandId || !deviceTypeId) {
			setError('Nazwa, marka i typ maszyny są wymagane.')
			return
		}
		setError(null)
		try {
			const device = await createDevice.mutateAsync({
				name,
				brand_id: brandId,
				device_type_id: deviceTypeId,
				model_serial_code: modelSerialCode || null,
				image_url: imageUrl || null,
			})
			for (const attachmentId of selectedAttachmentIds) {
				await linkDevice.mutateAsync({ attachmentId, deviceId: device.id })
			}
			void navigate({ to: '/catalog', search: { tab: 'models' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać maszyny.')
		}
	}

	return (
		<div className='mx-auto max-w-2xl'>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>Dodaj maszynę</h1>

			<div className='mb-6 space-y-4 rounded-lg border border-line bg-panel p-6'>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						Nazwa modelu
					</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						Kod modelu (opcjonalnie)
					</label>
					<input
						value={modelSerialCode}
						onChange={(e) => setModelSerialCode(e.target.value)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						Marka
					</label>
					<select
						value={brandId ?? ''}
						onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream'>
						<option value=''>Wybierz markę</option>
						{brands?.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						Typ maszyny
					</label>
					<select
						value={deviceTypeId ?? ''}
						onChange={(e) =>
							setDeviceTypeId(e.target.value ? Number(e.target.value) : null)
						}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream'>
						<option value=''>Wybierz typ</option>
						{deviceTypes?.map((t) => (
							<option key={t.id} value={t.id}>
								{t.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						URL zdjęcia (opcjonalnie)
					</label>
					<input
						value={imageUrl}
						onChange={(e) => setImageUrl(e.target.value)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
					/>
					{imageUrl && (
						<img src={imageUrl} alt='' className='mt-2 h-24 rounded object-contain' />
					)}
				</div>
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<div className='mb-3 flex items-center justify-between'>
					<label className='text-xs uppercase tracking-wide text-cream/50'>
						Przypisz istniejące dokumenty
					</label>
					<span className='text-xs text-cream/50'>
						{selectedLabel(selectedAttachmentIds.length)}
					</span>
				</div>
				<div className='max-h-80 space-y-1 overflow-y-auto'>
					{attachments?.map((attachment) => (
						<label
							key={attachment.id}
							className='flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft'>
							<input
								type='checkbox'
								checked={selectedAttachmentIds.includes(attachment.id)}
								onChange={() => toggleAttachment(attachment.id)}
							/>
							{attachment.original_filename}
						</label>
					))}
				</div>
			</div>

			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}

			<button
				onClick={handleSubmit}
				disabled={createDevice.isPending}
				className='w-full rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40'>
				{createDevice.isPending ? 'Zapisywanie…' : 'Dodaj maszynę'}
			</button>
		</div>
	)
}
