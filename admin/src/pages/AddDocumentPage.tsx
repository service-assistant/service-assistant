import { useCreateAttachment } from '@/hooks/useAttachments'
import { useCategoryTree } from '@/hooks/useCategories'
import { useDevices } from '@/hooks/useDevices'
import { categoryPath, flattenCategoryTree } from '@/lib/categoryTree'
import { documentCountLabel, machineCountLabel } from '@/lib/pluralize'
import { useNavigate } from '@tanstack/react-router'
import { Check, FileText, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'

type Step = 1 | 2 | 3

const STEPS: { step: Step; label: string }[] = [
	{ step: 1, label: 'Plik dokumentu' },
	{ step: 2, label: 'Wybór maszyn' },
	{ step: 3, label: 'Podsumowanie' },
]

function Stepper({ current }: { current: Step }) {
	return (
		<div className='mb-8 flex border-b border-line'>
			{STEPS.map(({ step, label }) => {
				const done = step < current
				const active = step === current
				return (
					<div
						key={step}
						className={`flex flex-1 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-medium ${
							active || done
								? 'border-ember text-ember'
								: 'border-transparent text-cream/40'
						}`}>
						<span
							className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${
								done
									? 'bg-ember text-ink'
									: active
										? 'border border-ember text-ember'
										: 'border border-line text-cream/40'
							}`}>
							{done ? <Check size={14} /> : step}
						</span>
						<span className='uppercase tracking-wide'>{label}</span>
					</div>
				)
			})}
		</div>
	)
}

export function AddDocumentPage() {
	const navigate = useNavigate()
	const { data: devices } = useDevices()
	const { data: tree } = useCategoryTree()
	const createAttachment = useCreateAttachment()

	const [step, setStep] = useState<Step>(1)
	const [files, setFiles] = useState<File[]>([])
	const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([])
	const [search, setSearch] = useState('')
	const [error, setError] = useState<string | null>(null)

	const flat = flattenCategoryTree(tree ?? [])
	const filteredDevices = useMemo(
		() => devices?.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())) ?? [],
		[devices, search],
	)
	const selectedDevices = devices?.filter((d) => selectedDeviceIds.includes(d.id)) ?? []

	function toggleDevice(id: number) {
		setSelectedDeviceIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		)
	}

	function isPdf(f: File) {
		return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
	}

	function handleFileChange(selected: File[]) {
		if (selected.some((f) => !isPdf(f))) {
			setError('Wszystkie pliki muszą być w formacie PDF.')
			return
		}
		setError(null)
		setFiles(selected)
	}

	function goToStep2() {
		if (files.length === 0) {
			setError('Wybierz plik PDF.')
			return
		}
		setError(null)
		setStep(2)
	}

	async function handleSubmit() {
		if (files.length === 0) return
		try {
			await createAttachment.mutateAsync({ files, deviceIds: selectedDeviceIds })
			void navigate({ to: '/' })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać dokumentu.')
		}
	}

	return (
		<div>
			<Stepper current={step} />

			{step === 1 && (
				<div>
					<h1 className='mb-6 text-2xl font-bold text-cream'>Dodaj dokument</h1>
					<label className='mb-2 block text-xs font-medium tracking-wide text-ember uppercase'>
						Załącznik PDF
					</label>
					<label className='flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-ember/50 bg-panel px-6 py-12 text-center hover:bg-panel-soft'>
						<input
							type='file'
							accept='application/pdf'
							multiple
							className='hidden'
							onChange={(e) => handleFileChange(Array.from(e.target.files ?? []))}
						/>
						<span className='flex size-12 items-center justify-center rounded-full bg-panel-soft text-ember'>
							<Upload size={20} />
						</span>
						<span className='text-sm font-medium text-cream'>
							{files.length === 1
								? files[0].name
								: files.length > 1
									? `Wybrano ${documentCountLabel(files.length)}`
									: 'Przeciągnij pliki tutaj lub wybierz je z dysku'}
						</span>
						<span className='rounded-md bg-panel-soft px-4 py-2 text-sm font-medium text-cream'>
							Wybierz z dysku
						</span>
					</label>

					{error && <p className='mt-3 text-sm text-red-400'>{error}</p>}

					<div className='mt-6 grid grid-cols-3 gap-4'>
						<div className='rounded-lg border border-line bg-panel px-4 py-3'>
							<div className='text-xs tracking-wide text-cream/40 uppercase'>
								Akceptowane formaty
							</div>
							<div className='mt-1 text-sm font-semibold text-cream'>PDF</div>
						</div>
						<div className='rounded-lg border border-line bg-panel px-4 py-3'>
							<div className='text-xs tracking-wide text-cream/40 uppercase'>
								Maksymalny rozmiar
							</div>
							<div className='mt-1 text-sm font-semibold text-cream'>200 MB</div>
						</div>
						<div className='rounded-lg border border-line bg-panel px-4 py-3'>
							<div className='text-xs tracking-wide text-cream/40 uppercase'>
								Następny krok
							</div>
							<div className='mt-1 text-sm font-semibold text-cream'>
								Przypisanie do maszyn
							</div>
						</div>
					</div>

					<div className='mt-8 flex justify-between border-t border-line pt-6'>
						<button
							onClick={() => void navigate({ to: '/' })}
							className='rounded-md border border-line px-4 py-2 text-sm font-medium text-cream/70 hover:bg-panel-soft'>
							Anuluj
						</button>
						<button
							onClick={goToStep2}
							className='rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
							Dalej →
						</button>
					</div>
				</div>
			)}

			{step === 2 && (
				<div>
					<h1 className='text-2xl font-bold text-cream'>Wybór maszyn</h1>
					<p className='mt-1 mb-6 text-sm text-cream/60'>
						Wybierz modele, do których ma zostać przypisany dokument.
					</p>

					<div className='mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
						<Search size={16} className='text-cream/40' />
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder='Szukaj po modelu, marce, numerze…'
							className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
						/>
					</div>

					<div className='rounded-lg border border-line bg-panel'>
						<div className='grid grid-cols-[auto_2fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
							<span />
							<span>Model</span>
							<span>Kategoria</span>
							<span>Dokumenty</span>
						</div>
						{filteredDevices.map((device) => {
							const checked = selectedDeviceIds.includes(device.id)
							return (
								<label
									key={device.id}
									className={`grid grid-cols-[auto_2fr_1fr_1fr] cursor-pointer items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0 hover:bg-panel-soft ${checked ? 'bg-panel-soft' : ''}`}>
									<input
										type='checkbox'
										checked={checked}
										onChange={() => toggleDevice(device.id)}
									/>
									<span className='text-cream'>{device.name}</span>
									<span>{categoryPath(device.category_id, flat)}</span>
									<span className='text-xs text-cream/50'>Brak</span>
								</label>
							)
						})}
					</div>

					<div className='mt-8 flex items-center justify-between border-t border-line pt-6'>
						<button
							onClick={() => setStep(1)}
							className='rounded-md border border-line px-4 py-2 text-sm font-medium text-cream/70 hover:bg-panel-soft'>
							Wstecz
						</button>
						<div className='flex items-center gap-4'>
							<span className='text-sm text-cream/60'>
								Wybrano:{' '}
								<span className='font-semibold text-cream'>
									{machineCountLabel(selectedDeviceIds.length)}
								</span>
							</span>
							<button
								onClick={() => setStep(3)}
								className='rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
								Dalej →
							</button>
						</div>
					</div>
				</div>
			)}

			{step === 3 && (
				<div>
					<h1 className='text-2xl font-bold text-cream'>Podsumowanie</h1>
					<p className='mt-1 mb-6 text-sm text-cream/60'>
						Sprawdź dokument i wybrane maszyny przed dodaniem.
					</p>

					<div className='mb-3 flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300'>
						<Check size={16} />
						Dokument zostanie przypisany do{' '}
						<span className='font-semibold'>
							{machineCountLabel(selectedDeviceIds.length)}
						</span>
						.
					</div>
					<div className='mb-6 rounded-md border border-line bg-panel px-4 py-3 text-sm text-cream/60'>
						Plik nie zostanie od razu przetworzony — pojawi się na liście dokumentów
						jako oczekujący. Przetwarzanie uruchamiasz osobno i możesz w tym czasie
						zamknąć kartę przeglądarki.
					</div>

					<h2 className='mb-2 text-sm font-semibold text-cream'>Dane dokumentu</h2>
					<div className='mb-6 rounded-lg border border-line bg-panel'>
						{files.map((f) => (
							<div
								key={f.name}
								className='flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0'>
								<span className='flex size-10 items-center justify-center rounded-md bg-rose-400/15 text-rose-300'>
									<FileText size={18} />
								</span>
								<div>
									<div className='text-sm font-medium text-cream'>{f.name}</div>
									<div className='text-xs text-cream/50'>
										PDF · {(f.size / 1024 / 1024).toFixed(1)} MB · Gotowy do
										dodania
									</div>
								</div>
							</div>
						))}
					</div>

					<h2 className='mb-2 text-sm font-semibold text-cream'>Wybrane maszyny</h2>
					<div className='mb-6 rounded-lg border border-line bg-panel'>
						<div className='grid grid-cols-[2fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
							<span>Model</span>
							<span>Kategoria</span>
						</div>
						{selectedDevices.map((device) => (
							<div
								key={device.id}
								className='grid grid-cols-[2fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0'>
								<span>
									<div className='text-cream'>{device.name}</div>
									{device.model_serial_code && (
										<div className='text-xs text-cream/40'>
											{device.model_serial_code}
										</div>
									)}
								</span>
								<span>{categoryPath(device.category_id, flat)}</span>
							</div>
						))}
					</div>

					{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}

					<div className='flex justify-between border-t border-line pt-6'>
						<button
							onClick={() => setStep(2)}
							className='rounded-md border border-line px-4 py-2 text-sm font-medium text-cream/70 hover:bg-panel-soft'>
							Wstecz
						</button>
						<button
							onClick={handleSubmit}
							disabled={createAttachment.isPending}
							className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink disabled:opacity-40'>
							{createAttachment.isPending ? 'Przesyłanie…' : 'Dodaj dokument →'}
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
