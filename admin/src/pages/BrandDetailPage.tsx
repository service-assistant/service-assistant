import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { useBrand, useDeleteBrand, useUpdateBrand } from '@/hooks/useBrands'
import { useDevices } from '@/hooks/useDevices'
import { machineCountLabel } from '@/lib/pluralize'

export function BrandDetailPage() {
	const { brandId } = useParams({ strict: false }) as { brandId: string }
	const id = Number(brandId)
	const navigate = useNavigate()
	const { data: brand, isLoading } = useBrand(id)
	const { data: devices } = useDevices()
	const updateBrand = useUpdateBrand(id)
	const deleteBrand = useDeleteBrand()

	const [name, setName] = useState('')
	const [logoUrl, setLogoUrl] = useState('')
	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (brand) {
			setName(brand.name)
			setLogoUrl(brand.logo_url ?? '')
		}
	}, [brand])

	const relatedDevices = devices?.filter((d) => d.brand_id === id) ?? []
	const dirty = brand && (name !== brand.name || logoUrl !== (brand.logo_url ?? ''))

	async function handleSave() {
		setError(null)
		try {
			await updateBrand.mutateAsync({ name, logo_url: logoUrl || null })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się zapisać zmian.')
		}
	}

	async function handleDelete() {
		try {
			await deleteBrand.mutateAsync(id)
			void navigate({ to: '/catalog', search: { tab: 'brands' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się usunąć marki.')
			setShowDeleteModal(false)
		}
	}

	if (isLoading || !brand) return <div className="text-cream/50">Ładowanie…</div>

	return (
		<div className="mx-auto max-w-3xl">
			<Link to="/catalog" search={{ tab: 'brands' }} className="mb-4 inline-block text-sm text-cream/60 hover:text-cream">
				← Wróć do katalogu
			</Link>
			<h1 className="mb-6 text-2xl font-semibold text-cream">{brand.name}</h1>

			<div className="mb-6 space-y-4 rounded-lg border border-line bg-panel p-6">
				<h2 className="text-sm font-medium text-cream">Informacje o marce</h2>
				<div>
					<label className="mb-1 block text-xs uppercase tracking-wide text-cream/50">Nazwa</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember"
					/>
				</div>
				<div>
					<label className="mb-1 block text-xs uppercase tracking-wide text-cream/50">URL logo</label>
					<input
						value={logoUrl}
						onChange={(e) => setLogoUrl(e.target.value)}
						className="w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember"
					/>
					{logoUrl && <img src={logoUrl} alt="" className="mt-2 h-16 rounded object-contain" />}
				</div>
				{error && <p className="text-sm text-red-400">{error}</p>}
				<div className="flex gap-2">
					<button
						onClick={handleSave}
						disabled={!dirty || updateBrand.isPending}
						className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
					>
						{updateBrand.isPending ? 'Zapisywanie…' : 'Zapisz'}
					</button>
					{dirty && (
						<button
							onClick={() => {
								setName(brand.name)
								setLogoUrl(brand.logo_url ?? '')
							}}
							className="rounded-md px-4 py-2 text-sm text-cream/60 hover:text-cream"
						>
							Anuluj
						</button>
					)}
				</div>
			</div>

			<div className="mb-6 rounded-lg border border-line bg-panel p-6">
				<h2 className="mb-3 text-sm font-medium text-cream">Powiązane maszyny ({machineCountLabel(relatedDevices.length)})</h2>
				{relatedDevices.length === 0 && <p className="text-sm text-cream/50">Brak powiązanych maszyn.</p>}
				<div className="space-y-1">
					{relatedDevices.map((device) => (
						<Link
							key={device.id}
							to="/machines/$deviceId"
							params={{ deviceId: String(device.id) }}
							className="block rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft hover:text-cream"
						>
							{device.name}
						</Link>
					))}
				</div>
			</div>

			<div className="rounded-lg border border-red-900/40 bg-panel p-6">
				<h2 className="mb-2 text-sm font-medium text-red-300">Strefa niebezpieczna</h2>
				<p className="mb-3 text-sm text-cream/50">Usunięcie marki jest nieodwracalne.</p>
				<button
					onClick={() => setShowDeleteModal(true)}
					className="rounded-md border border-red-700 px-4 py-2 text-sm text-red-300 hover:bg-red-900/20"
				>
					Usuń markę
				</button>
			</div>

			{showDeleteModal && (
				<ConfirmDeleteModal
					title="Usuń markę"
					description={`Marka "${brand.name}" zostanie trwale usunięta.`}
					pending={deleteBrand.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
		</div>
	)
}
