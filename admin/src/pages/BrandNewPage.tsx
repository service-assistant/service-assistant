import { useCreateBrand } from '@/hooks/useBrands'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export function BrandNewPage() {
	const navigate = useNavigate()
	const createBrand = useCreateBrand()
	const [name, setName] = useState('')
	const [logoUrl, setLogoUrl] = useState('')
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit() {
		if (!name) {
			setError('Nazwa marki jest wymagana.')
			return
		}
		setError(null)
		try {
			await createBrand.mutateAsync({ name, logo_url: logoUrl || null })
			void navigate({ to: '/catalog', search: { tab: 'brands' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać marki.')
		}
	}

	return (
		<div className='mx-auto max-w-lg'>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>Dodaj markę</h1>
			<div className='mb-6 space-y-4 rounded-lg border border-line bg-panel p-6'>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						Nazwa
					</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						URL logo (opcjonalnie)
					</label>
					<input
						value={logoUrl}
						onChange={(e) => setLogoUrl(e.target.value)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
					/>
					{logoUrl && (
						<img src={logoUrl} alt='' className='mt-2 h-16 rounded object-contain' />
					)}
				</div>
			</div>
			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}
			<button
				onClick={handleSubmit}
				disabled={createBrand.isPending}
				className='w-full rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40'>
				{createBrand.isPending ? 'Zapisywanie…' : 'Dodaj markę'}
			</button>
		</div>
	)
}
