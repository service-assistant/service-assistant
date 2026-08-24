import { MachineSelectionTree } from '@/components/MachineSelectionTree'
import { useCreateAttachment } from '@/hooks/useAttachments'
import { useCategoryTree } from '@/hooks/useCategories'
import { useDevices } from '@/hooks/useDevices'
import { categoryPath, flattenCategoryTree } from '@/lib/categoryTree'
import { fileSelectionError, mergeUploadFiles } from '@/lib/documentUpload'
import { documentCountLabel, machineCountLabel } from '@/lib/pluralize'
import { showToast } from '@/lib/toast'
import type { CategoryTree, Device } from '@/lib/types'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, FileText, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import './AddDocumentPage.css'

type Step = 1 | 2 | 3
const STEPS: { step: Step; label: string }[] = [
	{ step: 1, label: 'Plik dokumentu' },
	{ step: 2, label: 'Wybór maszyn' },
	{ step: 3, label: 'Podsumowanie' },
]

function formatBytes(size: number) {
	if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
	return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function Stepper({ current }: { current: Step }) {
	return (
		<div className='document-stepper' aria-label={`Krok ${current} z 3`}>
			{STEPS.map(({ step, label }) => {
				const active = step <= current
				return (
					<div
						key={step}
						className={`document-step ${active ? 'document-step--active' : ''}`}>
						<span className='document-step-number'>
							{step < current ? <Check size={14} strokeWidth={3} /> : step}
						</span>
						<span>{label}</span>
					</div>
				)
			})}
		</div>
	)
}

function PageHeading({ subtitle, title }: { subtitle?: string; title: string }) {
	return (
		<header className='document-heading'>
			<h1>{title}</h1>
			{subtitle && <p>{subtitle}</p>}
		</header>
	)
}

function InfoCard({ label, value }: { label: string; value: string }) {
	return (
		<div className='document-info-card'>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	)
}

function FileRows({ files, onRemove }: { files: File[]; onRemove?: (file: File) => void }) {
	return (
		<div className='document-file-list'>
			{files.map((file, index) => (
				<div className='document-file-row' key={`${file.name}-${file.size}-${index}`}>
					<div className='document-pdf-icon'>
						<FileText size={25} strokeWidth={2.4} />
						<small>PDF</small>
					</div>
					<div className='document-file-copy'>
						<strong title={file.name}>{file.name}</strong>
						<p>
							PDF <span>·</span> {formatBytes(file.size)} <span>·</span> <i /> Gotowy
							do dodania
						</p>
					</div>
					{onRemove && (
						<button
							type='button'
							className='document-remove-file'
							onClick={() => onRemove(file)}>
							<Trash2 size={16} /> Usuń
						</button>
					)}
				</div>
			))}
		</div>
	)
}

function UploadStep({
	error,
	files,
	onError,
	onFiles,
}: {
	error: string | null
	files: File[]
	onError: (message: string | null) => void
	onFiles: (files: File[]) => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const dragDepth = useRef(0)
	const [dragActive, setDragActive] = useState(false)

	function applyFiles(selected: File[]) {
		if (selected.length === 0) return
		const validationError = fileSelectionError(selected)
		if (validationError) {
			onError(validationError)
			return
		}
		onError(null)
		onFiles(mergeUploadFiles(files, selected))
		if (inputRef.current) inputRef.current.value = ''
	}

	function openPicker() {
		inputRef.current?.click()
	}
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			openPicker()
		}
	}
	function handleDragEnter(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		event.stopPropagation()
		dragDepth.current += 1
		if (event.dataTransfer.types.includes('Files')) setDragActive(true)
	}
	function handleDragLeave(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		event.stopPropagation()
		dragDepth.current = Math.max(0, dragDepth.current - 1)
		if (dragDepth.current === 0) setDragActive(false)
	}
	function handleDragOver(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		event.stopPropagation()
		event.dataTransfer.dropEffect = 'copy'
	}
	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		event.stopPropagation()
		dragDepth.current = 0
		setDragActive(false)
		applyFiles(Array.from(event.dataTransfer.files))
	}

	return (
		<>
			<PageHeading title='Dodaj dokument' />
			<section className='document-upload-section'>
				<label>Załącznik PDF</label>
				<input
					ref={inputRef}
					type='file'
					accept='application/pdf,.pdf'
					multiple
					hidden
					onChange={(event) => applyFiles(Array.from(event.target.files ?? []))}
				/>
				<div
					className={`document-drop-zone ${dragActive ? 'document-drop-zone--active' : ''}`}
					role='button'
					tabIndex={0}
					aria-label='Przeciągnij pliki PDF tutaj lub wybierz je z dysku'
					onClick={openPicker}
					onKeyDown={handleKeyDown}
					onDragEnter={handleDragEnter}
					onDragLeave={handleDragLeave}
					onDragOver={handleDragOver}
					onDrop={handleDrop}>
					<span className='document-upload-icon'>
						<Upload size={29} />
					</span>
					<strong>
						{dragActive
							? 'Upuść pliki, aby je dodać'
							: files.length > 0
								? `Wybrano ${documentCountLabel(files.length)}`
								: 'Przeciągnij pliki tutaj lub wybierz je z dysku'}
					</strong>
					<span className='document-picker-button'>Wybierz z dysku</span>
				</div>
				{files.length > 0 && (
					<FileRows
						files={files}
						onRemove={(file) => onFiles(files.filter((item) => item !== file))}
					/>
				)}
				{error && <p className='document-error'>{error}</p>}
				<div className='document-info-grid'>
					<InfoCard label='Akceptowane formaty' value='PDF' />
					<InfoCard label='Maksymalny rozmiar' value='200 MB / plik' />
					<InfoCard label='Następny krok' value='Przypisanie do maszyn' />
				</div>
			</section>
		</>
	)
}

function MachineStep({
	devices,
	onSelectionChange,
	search,
	selectedDeviceIds,
	setSearch,
	tree,
}: {
	devices: Device[]
	onSelectionChange: (ids: number[]) => void
	search: string
	selectedDeviceIds: number[]
	setSearch: (value: string) => void
	tree: CategoryTree[]
}) {
	return (
		<>
			<PageHeading
				title='Wybór maszyn'
				subtitle='Wybierz maszyny, do których mają zostać przypisane dokumenty.'
			/>
			<div className='document-machine-toolbar'>
				<Search size={18} />
				<input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder='Szukaj po maszynie, katalogu, numerze…'
				/>
			</div>
			<MachineSelectionTree
				devices={devices}
				onSelectionChange={onSelectionChange}
				search={search}
				selectedIds={selectedDeviceIds}
				tree={tree}
			/>
		</>
	)
}

function SummaryStep({
	files,
	flat,
	selectedDevices,
}: {
	files: File[]
	flat: ReturnType<typeof flattenCategoryTree>
	selectedDevices: Device[]
}) {
	return (
		<>
			<PageHeading
				title='Podsumowanie'
				subtitle='Sprawdź dokumenty i wybrane maszyny przed dodaniem.'
			/>
			<div className='document-summary-notice'>
				<span>
					<Check size={13} />
				</span>
				Dokumenty zostaną przypisane do{' '}
				<strong>{machineCountLabel(selectedDevices.length)}</strong>.
			</div>
			<section className='document-summary-section'>
				<h2>Dane dokumentu</h2>
				<FileRows files={files} />
			</section>
			<section className='document-summary-section'>
				<h2>Wybrane maszyny</h2>
				<div className='document-summary-table'>
					<div>
						<strong>Maszyna</strong>
						<strong>Katalog</strong>
					</div>
					{selectedDevices.length === 0 && <p>Brak przypisanych maszyn</p>}
					{selectedDevices.map((device) => (
						<div key={device.id}>
							<span className='document-machine-name'>
								<strong>{device.name}</strong>
								<small>{device.model_serial_code || 'Brak kodu'}</small>
							</span>
							<span>{categoryPath(device.category_id, flat)}</span>
						</div>
					))}
				</div>
			</section>
		</>
	)
}

function WizardFooter({
	disabled,
	onPrimary,
	onSecondary,
	primaryLabel,
	secondaryLabel,
	status,
}: {
	disabled?: boolean
	onPrimary: () => void
	onSecondary: () => void
	primaryLabel: string
	secondaryLabel: string
	status?: string
}) {
	return (
		<footer className='document-wizard-footer'>
			<button type='button' className='document-secondary-button' onClick={onSecondary}>
				{secondaryLabel}
			</button>
			{status && <span className='document-footer-status'>{status}</span>}
			<button
				type='button'
				className='document-primary-button'
				disabled={disabled}
				onClick={onPrimary}>
				{primaryLabel} <ArrowRight size={20} />
			</button>
		</footer>
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
	const flat = useMemo(() => flattenCategoryTree(tree ?? []), [tree])
	const selectedDevices = devices?.filter((device) => selectedDeviceIds.includes(device.id)) ?? []
	async function handleSubmit() {
		if (files.length === 0) return
		try {
			setError(null)
			await createAttachment.mutateAsync({ files, deviceIds: selectedDeviceIds })
			showToast({
				message:
					'Dodano dokumenty do bazy wiedzy. Uruchom ich przetwarzanie na liście dokumentów.',
			})
			void navigate({ to: '/' })
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: 'Nie udało się dodać dokumentu.',
			)
		}
	}

	return (
		<div className='add-document-page'>
			<div className='document-wizard-content'>
				<Stepper current={step} />
				{step === 1 && (
					<UploadStep files={files} error={error} onError={setError} onFiles={setFiles} />
				)}
				{step === 2 && (
					<MachineStep
						devices={devices ?? []}
						onSelectionChange={setSelectedDeviceIds}
						search={search}
						selectedDeviceIds={selectedDeviceIds}
						setSearch={setSearch}
						tree={tree ?? []}
					/>
				)}
				{step === 3 && (
					<SummaryStep files={files} flat={flat} selectedDevices={selectedDevices} />
				)}
				{step === 3 && error && <p className='document-error'>{error}</p>}
			</div>
			{step === 1 && (
				<WizardFooter
					disabled={files.length === 0}
					secondaryLabel='Anuluj'
					primaryLabel='Dalej'
					onSecondary={() => void navigate({ to: '/' })}
					onPrimary={() => {
						setError(null)
						setStep(2)
					}}
				/>
			)}
			{step === 2 && (
				<WizardFooter
					secondaryLabel='Wstecz'
					primaryLabel='Dalej'
					status={`Wybrano: ${machineCountLabel(selectedDeviceIds.length)}`}
					onSecondary={() => setStep(1)}
					onPrimary={() => setStep(3)}
				/>
			)}
			{step === 3 && (
				<WizardFooter
					disabled={createAttachment.isPending}
					secondaryLabel='Wstecz'
					primaryLabel={createAttachment.isPending ? 'Przesyłanie…' : 'Dodaj dokument'}
					onSecondary={() => setStep(2)}
					onPrimary={() => void handleSubmit()}
				/>
			)}
		</div>
	)
}
