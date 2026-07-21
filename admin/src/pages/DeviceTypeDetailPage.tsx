import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { useDeleteDeviceType, useDeviceType, useUpdateDeviceType } from '@/hooks/useDeviceTypes'
import { useDevices } from '@/hooks/useDevices'
import { machineCountLabel } from '@/lib/pluralize'

export function DeviceTypeDetailPage() {
	const { deviceTypeId } = useParams({ strict: false }) as { deviceTypeId: string }
	const id = Number(deviceTypeId)
	const navigate = useNavigate()
	const { data: deviceType, isLoading } = useDeviceType(id)
	const { data: devices } = useDevices()
	const updateDeviceType = useUpdateDeviceType(id)
	const deleteDeviceType = useDeleteDeviceType()

	const [name, setName] = useState('')
	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (deviceType) setName(deviceType.name)
	}, [deviceType])

	const relatedDevices = devices?.filter((d) => d.device_type_id === id) ?? []
	const dirty = deviceType && name !== deviceType.name

	async function handleSave() {
		setError(null)
		try {
			await updateDeviceType.mutateAsync({ name })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się zapisać zmian.')
		}
	}

	async function handleDelete() {
		try {
			await deleteDeviceType.mutateAsync(id)
			void navigate({ to: '/catalog', search: { tab: 'types' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się usunąć typu.')
			setShowDeleteModal(false)
		}
	}

	if (isLoading || !deviceType) return <div className="text-cream/50">Ładowanie…</div>

	return (
		<div className="mx-auto max-w-3xl">
			<Link to="/catalog" search={{ tab: 'types' }} className="mb-4 inline-block text-sm text-cream/60 hover:text-cream">
				← Wróć do katalogu
			</Link>
			<h1 className="mb-6 text-2xl font-semibold text-cream">{deviceType.name}</h1>

			<div className="mb-6 space-y-4 rounded-lg border border-line bg-panel p-6">
				<h2 className="text-sm font-medium text-cream">Informacje o typie</h2>
				<div>
					<label className="mb-1 block text-xs uppercase tracking-wide text-cream/50">Nazwa</label>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember"
					/>
				</div>
				{error && <p className="text-sm text-red-400">{error}</p>}
				<div className="flex gap-2">
					<button
						onClick={handleSave}
						disabled={!dirty || updateDeviceType.isPending}
						className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
					>
						{updateDeviceType.isPending ? 'Zapisywanie…' : 'Zapisz'}
					</button>
					{dirty && (
						<button
							onClick={() => setName(deviceType.name)}
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
				<p className="mb-3 text-sm text-cream/50">Usunięcie typu jest nieodwracalne.</p>
				<button
					onClick={() => setShowDeleteModal(true)}
					className="rounded-md border border-red-700 px-4 py-2 text-sm text-red-300 hover:bg-red-900/20"
				>
					Usuń typ
				</button>
			</div>

			{showDeleteModal && (
				<ConfirmDeleteModal
					title="Usuń typ maszyny"
					description={`Typ "${deviceType.name}" zostanie trwale usunięty.`}
					pending={deleteDeviceType.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
		</div>
	)
}
