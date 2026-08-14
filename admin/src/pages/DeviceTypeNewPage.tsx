import { useCreateDeviceType } from '@/hooks/useDeviceTypes'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export function DeviceTypeNewPage() {
	const navigate = useNavigate()
	const createDeviceType = useCreateDeviceType()
	const [name, setName] = useState('')
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit() {
		if (!name) {
			setError('Nazwa typu jest wymagana.')
			return
		}
		setError(null)
		try {
			await createDeviceType.mutateAsync({ name })
			void navigate({ to: '/catalog', search: { tab: 'types' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać typu.')
		}
	}

	return (
		<div className='mx-auto max-w-lg'>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>Dodaj typ maszyny</h1>
			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
					Nazwa
				</label>
				<input
					value={name}
					onChange={(e) => setName(e.target.value)}
					className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
				/>
			</div>
			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}
			<button
				onClick={handleSubmit}
				disabled={createDeviceType.isPending}
				className='w-full rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40'>
				{createDeviceType.isPending ? 'Zapisywanie…' : 'Dodaj typ'}
			</button>
		</div>
	)
}
