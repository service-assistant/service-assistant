import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useCreateAttachment } from '@/hooks/useAttachments'
import { useBrands } from '@/hooks/useBrands'
import { useDevices } from '@/hooks/useDevices'
import { selectedLabel } from '@/lib/pluralize'

export function AddDocumentPage() {
	const navigate = useNavigate()
	const { data: devices } = useDevices()
	const { data: brands } = useBrands()
	const createAttachment = useCreateAttachment()

	const [file, setFile] = useState<File | null>(null)
	const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([])
	const [search, setSearch] = useState('')
	const [error, setError] = useState<string | null>(null)

	const brandMap = new Map(brands?.map((b) => [b.id, b.name]))
	const filteredDevices = devices?.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())) ?? []

	function toggleDevice(id: number) {
		setSelectedDeviceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
	}

	async function handleSubmit() {
		if (!file) {
			setError('Wybierz plik PDF.')
			return
		}
		if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
			setError('Plik musi być w formacie PDF.')
			return
		}
		setError(null)
		try {
			await createAttachment.mutateAsync({ file, deviceIds: selectedDeviceIds })
			void navigate({ to: '/' })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać dokumentu.')
		}
	}

	return (
		<div className="mx-auto max-w-2xl">
			<h1 className="mb-6 text-2xl font-semibold text-cream">Dodaj dokument</h1>

			<div className="mb-6 rounded-lg border border-line bg-panel p-6">
				<label className="mb-2 block text-xs uppercase tracking-wide text-cream/50">Plik PDF (max 200MB)</label>
				<input
					type="file"
					accept="application/pdf"
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
					className="w-full text-sm text-cream/80"
				/>
				{file && <p className="mt-2 text-sm text-cream/60">{file.name}</p>}
			</div>

			<div className="mb-6 rounded-lg border border-line bg-panel p-6">
				<div className="mb-3 flex items-center justify-between">
					<label className="text-xs uppercase tracking-wide text-cream/50">Przypisz do maszyn</label>
					<span className="text-xs text-cream/50">{selectedLabel(selectedDeviceIds.length)}</span>
				</div>
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Szukaj maszyny…"
					className="mb-3 w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none placeholder:text-cream/40"
				/>
				<div className="max-h-80 space-y-1 overflow-y-auto">
					{filteredDevices.map((device) => (
						<label
							key={device.id}
							className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft"
						>
							<input
								type="checkbox"
								checked={selectedDeviceIds.includes(device.id)}
								onChange={() => toggleDevice(device.id)}
							/>
							{device.name}{' '}
							<span className="text-xs text-cream/40">({brandMap.get(device.brand_id) ?? '?'})</span>
						</label>
					))}
				</div>
			</div>

			{error && <p className="mb-4 text-sm text-red-400">{error}</p>}

			<button
				onClick={handleSubmit}
				disabled={createAttachment.isPending}
				className="w-full rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
			>
				{createAttachment.isPending ? 'Przesyłanie…' : 'Dodaj dokument'}
			</button>
		</div>
	)
}
