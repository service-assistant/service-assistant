import { useAttachments, useLinkDevice } from '@/hooks/useAttachments'
import { useCategoryTree } from '@/hooks/useCategories'
import { useCreateDevice } from '@/hooks/useDevices'
import { categoryPath, flattenCategoryTree, type FlatCategory } from '@/lib/categoryTree'
import { getDocumentCategory, type DocumentCategory } from '@/lib/documentCategory'
import { documentCountLabel } from '@/lib/pluralize'
import type { Attachment } from '@/lib/types'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, FileText, Plus, Search, ShieldAlert, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import './AddMachinePage.css'

type Step = 1 | 2 | 3
type DocumentFilter = DocumentCategory | 'all'
type MachineDraft = {
	name: string
	modelSerialCode: string
	categoryId: number
	imageUrl: string
}

const STEPS: { step: Step; label: string }[] = [
	{ step: 1, label: 'Dane maszyny' },
	{ step: 2, label: 'Dokumentacja' },
	{ step: 3, label: 'Podsumowanie' },
]
const DOCUMENT_FILTERS: DocumentFilter[] = [
	'all',
	'Instrukcja',
	'Kody błędów',
	'Schemat',
	'Biuletyn',
	'Dokument',
]
const MAX_IMAGE_SIZE = 8 * 1024 * 1024

function formatDate(value: string) {
	return new Date(value).toLocaleDateString('pl-PL', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function Stepper({ current }: { current: Step }) {
	return (
		<div className='machine-wizard-stepper' aria-label={`Krok ${current} z 3`}>
			{STEPS.map(({ step, label }) => (
				<div
					key={step}
					className={`machine-wizard-step ${step <= current ? 'machine-wizard-step--active' : ''}`}>
					<span>{step < current ? <Check size={14} strokeWidth={3} /> : step}</span>
					<strong>{label}</strong>
				</div>
			))}
		</div>
	)
}

function Heading({ subtitle, title }: { subtitle: string; title: string }) {
	return (
		<header className='machine-wizard-heading'>
			<h1>{title}</h1>
			<p>{subtitle}</p>
		</header>
	)
}

function WizardCheckbox({
	checked,
	label,
	mixed = false,
	onChange,
}: {
	checked: boolean
	label: string
	mixed?: boolean
	onChange: () => void
}) {
	const ref = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (ref.current) ref.current.indeterminate = mixed
	}, [mixed])
	return (
		<>
			<input
				ref={ref}
				type='checkbox'
				className='machine-wizard-checkbox-input'
				checked={checked}
				aria-label={label}
				onChange={onChange}
			/>
			<span className='machine-wizard-checkbox-box' aria-hidden='true'>
				{mixed ? <i /> : checked ? <Check size={13} strokeWidth={4} /> : null}
			</span>
		</>
	)
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
	return (
		<label className='machine-wizard-field'>
			<span>{label}</span>
			{children}
		</label>
	)
}

function ImagePicker({
	fileName,
	imageUrl,
	onError,
	onFileName,
	onImageUrl,
}: {
	fileName: string
	imageUrl: string
	onError: (value: string | null) => void
	onFileName: (value: string) => void
	onImageUrl: (value: string) => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const dragDepth = useRef(0)
	const [dragActive, setDragActive] = useState(false)

	function applyFile(file?: File) {
		if (!file) return
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			onError('Wybierz zdjęcie JPG, PNG lub WebP.')
			return
		}
		if (file.size > MAX_IMAGE_SIZE) {
			onError('Zdjęcie może mieć maksymalnie 8 MB.')
			return
		}
		const reader = new FileReader()
		reader.onload = () => {
			onImageUrl(String(reader.result))
			onFileName(file.name)
			onError(null)
		}
		reader.onerror = () => onError('Nie udało się odczytać zdjęcia.')
		reader.readAsDataURL(file)
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
		dragDepth.current += 1
		setDragActive(true)
	}

	function handleDragLeave(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		dragDepth.current = Math.max(0, dragDepth.current - 1)
		if (dragDepth.current === 0) setDragActive(false)
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		dragDepth.current = 0
		setDragActive(false)
		applyFile(event.dataTransfer.files[0])
	}

	return (
		<div className='machine-image-picker-wrap'>
			<span className='machine-image-picker-label'>Zdjęcie z dysku</span>
			<input
				ref={inputRef}
				type='file'
				accept='image/jpeg,image/png,image/webp'
				hidden
				onChange={(event) => applyFile(event.target.files?.[0])}
			/>
			<div
				className={`machine-image-picker ${dragActive ? 'machine-image-picker--active' : ''}`}
				role='button'
				tabIndex={0}
				onClick={openPicker}
				onKeyDown={handleKeyDown}
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={(event) => event.preventDefault()}
				onDrop={handleDrop}
				aria-label='Przeciągnij zdjęcie tutaj lub wybierz je z dysku'>
				{imageUrl ? (
					<>
						<img src={imageUrl} alt='Podgląd zdjęcia maszyny' />
						<span className='machine-image-change'>Zmień zdjęcie</span>
						{fileName && <small>{fileName}</small>}
					</>
				) : (
					<>
						<i className='machine-image-upload-icon'>
							<Upload size={28} />
						</i>
						<strong>
							{dragActive
								? 'Upuść zdjęcie tutaj'
								: 'Przeciągnij zdjęcie tutaj lub wybierz je z dysku'}
						</strong>
						<span className='machine-image-select'>Wybierz z dysku</span>
					</>
				)}
			</div>
		</div>
	)
}

function BasicStep({
	categoryId,
	fileName,
	flat,
	imageUrl,
	modelCode,
	modelName,
	onCategoryChange,
	onError,
	onFileName,
	onImageUrlChange,
	onModelCodeChange,
	onModelNameChange,
}: {
	categoryId: number | null
	fileName: string
	flat: FlatCategory[]
	imageUrl: string
	modelCode: string
	modelName: string
	onCategoryChange: (id: number | null) => void
	onError: (value: string | null) => void
	onFileName: (value: string) => void
	onImageUrlChange: (value: string) => void
	onModelCodeChange: (value: string) => void
	onModelNameChange: (value: string) => void
}) {
	return (
		<>
			<Heading
				title='Dodaj maszynę'
				subtitle='Uzupełnij podstawowe dane maszyny i zdjęcie widoczne w katalogu.'
			/>
			<div className='machine-basic-grid'>
				<div className='machine-basic-fields'>
					<Field label='Nazwa maszyny'>
						<input
							value={modelName}
							onChange={(event) => onModelNameChange(event.target.value)}
							placeholder='np. Industrial X-200 Pro'
						/>
					</Field>
					<Field label='Kod maszyny (opcjonalnie)'>
						<input
							value={modelCode}
							onChange={(event) => onModelCodeChange(event.target.value)}
							placeholder='np. X200-PRO-24'
						/>
					</Field>
					<Field label='Katalog'>
						<select
							value={categoryId ?? ''}
							onChange={(event) =>
								onCategoryChange(
									event.target.value ? Number(event.target.value) : null,
								)
							}>
							<option value=''>Wybierz katalog</option>
							{flat.map((category) => (
								<option
									key={category.id}
									value={
										category.id
									}>{`${'— '.repeat(category.depth)}${category.name}`}</option>
							))}
						</select>
					</Field>
				</div>
				<div className='machine-basic-image'>
					<Field label='URL zdjęcia (opcjonalnie)'>
						<input
							value={imageUrl.startsWith('data:') ? '' : imageUrl}
							onChange={(event) => {
								onImageUrlChange(event.target.value)
								onFileName('')
							}}
							placeholder='https://example.com/maszyna.jpg'
						/>
					</Field>
					<ImagePicker
						fileName={fileName}
						imageUrl={imageUrl}
						onError={onError}
						onFileName={onFileName}
						onImageUrl={onImageUrlChange}
					/>
				</div>
			</div>
		</>
	)
}

function DocumentsStep({
	attachments,
	filter,
	search,
	selectedIds,
	onFilterChange,
	onSearchChange,
	onToggle,
	onToggleVisible,
}: {
	attachments: Attachment[]
	filter: DocumentFilter
	search: string
	selectedIds: number[]
	onFilterChange: (value: DocumentFilter) => void
	onSearchChange: (value: string) => void
	onToggle: (id: number) => void
	onToggleVisible: (ids: number[]) => void
}) {
	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase()
		return attachments.filter((attachment) => {
			const category = getDocumentCategory(attachment.original_filename)
			return (
				(filter === 'all' || category === filter) &&
				attachment.original_filename.toLowerCase().includes(query)
			)
		})
	}, [attachments, filter, search])
	const visibleIds = filtered.map((attachment) => attachment.id)
	const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
	const someSelected = visibleIds.some((id) => selectedIds.includes(id))

	return (
		<>
			<Heading
				title='Wybór plików'
				subtitle='Wybierz dokumenty, które mają zostać przypisane do dodawanej maszyny.'
			/>
			<div className='machine-document-toolbar'>
				<div>
					<Search size={18} />
					<input
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder='Szukaj po nazwie pliku…'
					/>
				</div>
				<select
					value={filter}
					onChange={(event) => onFilterChange(event.target.value as DocumentFilter)}>
					{DOCUMENT_FILTERS.map((value) => (
						<option key={value} value={value}>
							{value === 'all' ? 'Typ: wszystkie' : value}
						</option>
					))}
				</select>
			</div>
			<div className='machine-document-table'>
				<div className='machine-document-table-header'>
					<label>
						<WizardCheckbox
							checked={allSelected}
							mixed={!allSelected && someSelected}
							label='Zaznacz wszystkie widoczne dokumenty'
							onChange={() => onToggleVisible(visibleIds)}
						/>
					</label>
					<span />
					<strong>Plik</strong>
					<strong>Typ</strong>
					<strong>Dodano</strong>
				</div>
				{filtered.length === 0 && (
					<p className='machine-document-empty'>Brak dokumentów do wyświetlenia.</p>
				)}
				{filtered.map((attachment) => {
					const selected = selectedIds.includes(attachment.id)
					const category = getDocumentCategory(attachment.original_filename)
					const CategoryIcon = category === 'Kody błędów' ? ShieldAlert : FileText
					return (
						<label
							key={attachment.id}
							className={`machine-document-choice ${selected ? 'machine-document-choice--selected' : ''}`}>
							<WizardCheckbox
								checked={selected}
								label={`Wybierz dokument ${attachment.original_filename}`}
								onChange={() => onToggle(attachment.id)}
							/>
							<i
								className={`machine-document-type-icon machine-document-type-icon--${category === 'Kody błędów' ? 'alert' : 'file'}`}>
								<CategoryIcon size={20} />
							</i>
							<strong title={attachment.original_filename}>
								{attachment.original_filename}
							</strong>
							<span>{category}</span>
							<time>{formatDate(attachment.created_at)}</time>
						</label>
					)
				})}
			</div>
		</>
	)
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className='machine-summary-row'>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	)
}

function SummaryStep({
	draft,
	flat,
	selectedAttachments,
}: {
	draft: MachineDraft
	flat: FlatCategory[]
	selectedAttachments: Attachment[]
}) {
	return (
		<>
			<Heading
				title='Podsumowanie'
				subtitle='Sprawdź dane maszyny i wybrane pliki przed dodaniem.'
			/>
			<div className='machine-summary-notice'>
				<span>
					<Check size={13} />
				</span>
				Maszyna zostanie dodana do katalogu z{' '}
				<strong>{documentCountLabel(selectedAttachments.length)}</strong>.
			</div>
			<section className='machine-summary-section'>
				<h2>Dane maszyny</h2>
				<div className='machine-summary-data'>
					{draft.imageUrl && <img src={draft.imageUrl} alt='Podgląd maszyny' />}
					<div className='machine-summary-columns'>
						<div>
							<SummaryRow label='Maszyna' value={draft.name} />
							<SummaryRow
								label='Kod maszyny'
								value={draft.modelSerialCode || 'Nie podano'}
							/>
						</div>
						<div>
							<SummaryRow
								label='Katalog'
								value={categoryPath(draft.categoryId, flat)}
							/>
							<SummaryRow
								label='Zdjęcie'
								value={draft.imageUrl ? 'Dodano' : 'Nie podano'}
							/>
							<SummaryRow
								label='Status'
								value={<i className='machine-summary-ready'>● Gotowa do dodania</i>}
							/>
						</div>
					</div>
				</div>
			</section>
			<section className='machine-summary-section'>
				<h2>Wybrane pliki</h2>
				<div className='machine-summary-documents'>
					<div>
						<strong>Plik</strong>
						<strong>Typ</strong>
						<strong>Dodano</strong>
					</div>
					{selectedAttachments.length === 0 && <p>Brak wybranych dokumentów</p>}
					{selectedAttachments.map((attachment) => (
						<div key={attachment.id}>
							<strong>{attachment.original_filename}</strong>
							<span>{getDocumentCategory(attachment.original_filename)}</span>
							<time>{formatDate(attachment.created_at)}</time>
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
	status?: React.ReactNode
}) {
	return (
		<footer className='machine-wizard-footer'>
			<button type='button' className='machine-wizard-secondary' onClick={onSecondary}>
				{secondaryLabel}
			</button>
			{status && <span className='machine-wizard-footer-status'>{status}</span>}
			<button
				type='button'
				className='machine-wizard-primary'
				disabled={disabled}
				onClick={onPrimary}>
				{primaryLabel === 'Dodaj maszynę' ? <Plus size={19} /> : null}
				{primaryLabel}
				{primaryLabel !== 'Dodaj maszynę' ? <ArrowRight size={20} /> : null}
			</button>
		</footer>
	)
}

export function AddMachineWizard({
	attachments,
	flat,
	onCancel,
	onSubmit,
	submitting = false,
}: {
	attachments: Attachment[]
	flat: FlatCategory[]
	onCancel: () => void
	onSubmit: (draft: MachineDraft, attachmentIds: number[]) => Promise<void>
	submitting?: boolean
}) {
	const [step, setStep] = useState<Step>(1)
	const [modelName, setModelName] = useState('')
	const [modelCode, setModelCode] = useState('')
	const [categoryId, setCategoryId] = useState<number | null>(null)
	const [imageUrl, setImageUrl] = useState('')
	const [imageFileName, setImageFileName] = useState('')
	const [selectedIds, setSelectedIds] = useState<number[]>([])
	const [search, setSearch] = useState('')
	const [filter, setFilter] = useState<DocumentFilter>('all')
	const [error, setError] = useState<string | null>(null)
	const selectedAttachments = attachments.filter((attachment) =>
		selectedIds.includes(attachment.id),
	)
	const draft: MachineDraft = {
		name: modelName.trim(),
		modelSerialCode: modelCode.trim(),
		categoryId: categoryId ?? 0,
		imageUrl: imageUrl.trim(),
	}
	const basicComplete = draft.name.length > 0 && categoryId !== null

	function toggleAttachment(id: number) {
		setSelectedIds((current) =>
			current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
		)
	}

	function toggleVisible(ids: number[]) {
		if (ids.length === 0) return
		setSelectedIds((current) =>
			ids.every((id) => current.includes(id))
				? current.filter((id) => !ids.includes(id))
				: Array.from(new Set([...current, ...ids])),
		)
	}

	async function submit() {
		if (!basicComplete) return
		try {
			setError(null)
			await onSubmit(draft, selectedIds)
		} catch (submitError) {
			setError(
				submitError instanceof Error ? submitError.message : 'Nie udało się dodać maszyny.',
			)
		}
	}

	return (
		<div className='add-machine-page'>
			<div className='machine-wizard-content'>
				<Stepper current={step} />
				{step === 1 && (
					<BasicStep
						categoryId={categoryId}
						fileName={imageFileName}
						flat={flat}
						imageUrl={imageUrl}
						modelCode={modelCode}
						modelName={modelName}
						onCategoryChange={setCategoryId}
						onError={setError}
						onFileName={setImageFileName}
						onImageUrlChange={setImageUrl}
						onModelCodeChange={setModelCode}
						onModelNameChange={setModelName}
					/>
				)}
				{step === 2 && (
					<DocumentsStep
						attachments={attachments}
						filter={filter}
						search={search}
						selectedIds={selectedIds}
						onFilterChange={setFilter}
						onSearchChange={setSearch}
						onToggle={toggleAttachment}
						onToggleVisible={toggleVisible}
					/>
				)}
				{step === 3 && (
					<SummaryStep
						draft={draft}
						flat={flat}
						selectedAttachments={selectedAttachments}
					/>
				)}
				{error && <p className='machine-wizard-error'>{error}</p>}
			</div>
			{step === 1 && (
				<WizardFooter
					disabled={!basicComplete}
					primaryLabel='Dalej'
					secondaryLabel='Anuluj'
					onPrimary={() => {
						setError(null)
						setStep(2)
					}}
					onSecondary={onCancel}
				/>
			)}
			{step === 2 && (
				<WizardFooter
					primaryLabel='Dalej'
					secondaryLabel='Wstecz'
					status={
						<>
							Wybrano: <strong>{documentCountLabel(selectedIds.length)}</strong>
						</>
					}
					onPrimary={() => setStep(3)}
					onSecondary={() => setStep(1)}
				/>
			)}
			{step === 3 && (
				<WizardFooter
					disabled={submitting}
					primaryLabel={submitting ? 'Dodawanie…' : 'Dodaj maszynę'}
					secondaryLabel='Wstecz'
					onPrimary={() => void submit()}
					onSecondary={() => setStep(2)}
				/>
			)}
		</div>
	)
}

export function AddMachinePage() {
	const navigate = useNavigate()
	const { data: tree } = useCategoryTree()
	const { data: attachments } = useAttachments()
	const createDevice = useCreateDevice()
	const linkDevice = useLinkDevice()
	const flat = useMemo(() => flattenCategoryTree(tree ?? []), [tree])

	async function handleSubmit(draft: MachineDraft, attachmentIds: number[]) {
		const device = await createDevice.mutateAsync({
			name: draft.name,
			category_id: draft.categoryId,
			model_serial_code: draft.modelSerialCode || null,
			image_url: draft.imageUrl || null,
		})
		for (const attachmentId of attachmentIds)
			await linkDevice.mutateAsync({ attachmentId, deviceId: device.id })
		void navigate({ to: '/catalog', search: { tab: 'models' } })
	}

	return (
		<AddMachineWizard
			attachments={attachments ?? []}
			flat={flat}
			submitting={createDevice.isPending || linkDevice.isPending}
			onCancel={() => void navigate({ to: '/catalog', search: { tab: 'models' } })}
			onSubmit={handleSubmit}
		/>
	)
}
