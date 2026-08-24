import { useAttachments, useLinkDevice, useUnlinkDevice } from '@/hooks/useAttachments'
import { useDevice, useDeviceAttachments } from '@/hooks/useDevices'
import { getDocumentCategory, type DocumentCategory } from '@/lib/documentCategory'
import { documentCountLabel } from '@/lib/pluralize'
import type { Attachment } from '@/lib/types'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Check, FileText, Search, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './AddMachinePage.css'
import './MachineDocumentsPage.css'

type DocumentFilter = DocumentCategory | 'all'

const DOCUMENT_FILTERS: DocumentFilter[] = [
	'all',
	'Instrukcja',
	'Kody błędów',
	'Schemat',
	'Biuletyn',
	'Dokument',
]

function formatDate(value: string) {
	return new Date(value).toLocaleDateString('pl-PL', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function DocumentCheckbox({
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
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (inputRef.current) inputRef.current.indeterminate = mixed
	}, [mixed])

	return (
		<>
			<input
				ref={inputRef}
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

function DocumentsTable({
	attachments,
	selectedIds,
	onToggle,
	onToggleVisible,
}: {
	attachments: Attachment[]
	selectedIds: number[]
	onToggle: (attachmentId: number) => void
	onToggleVisible: (attachmentIds: number[]) => void
}) {
	const visibleIds = attachments.map((attachment) => attachment.id)
	const allSelected =
		visibleIds.length > 0 &&
		visibleIds.every((attachmentId) => selectedIds.includes(attachmentId))
	const someSelected = visibleIds.some((attachmentId) => selectedIds.includes(attachmentId))

	return (
		<div className='machine-document-table machine-documents-table'>
			<div className='machine-document-table-header'>
				<label>
					<DocumentCheckbox
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
			<div className='machine-documents-rows'>
				{attachments.length === 0 && (
					<p className='machine-document-empty'>Brak dokumentów do wyświetlenia.</p>
				)}
				{attachments.map((attachment) => {
					const selected = selectedIds.includes(attachment.id)
					const category = getDocumentCategory(attachment.original_filename)
					const CategoryIcon = category === 'Kody błędów' ? ShieldAlert : FileText
					return (
						<label
							key={attachment.id}
							className={`machine-document-choice ${selected ? 'machine-document-choice--selected' : ''}`}>
							<DocumentCheckbox
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
		</div>
	)
}

export function MachineDocumentsPage() {
	const { deviceId } = useParams({ strict: false }) as { deviceId: string }
	const id = Number(deviceId)
	const navigate = useNavigate()
	const { data: device, isLoading: deviceLoading } = useDevice(id)
	const { data: linkedAttachments, isLoading: linkedLoading } = useDeviceAttachments(id)
	const { data: attachments, isLoading: attachmentsLoading } = useAttachments()
	const linkDevice = useLinkDevice()
	const unlinkDevice = useUnlinkDevice()
	const [search, setSearch] = useState('')
	const [filter, setFilter] = useState<DocumentFilter>('all')
	const [selectedIds, setSelectedIds] = useState<number[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const initialIds = useMemo(
		() => linkedAttachments?.map((attachment) => attachment.id) ?? [],
		[linkedAttachments],
	)
	const currentSelectedIds = selectedIds ?? initialIds
	const filteredAttachments = useMemo(() => {
		const query = search.trim().toLowerCase()
		return (attachments ?? []).filter((attachment) => {
			const category = getDocumentCategory(attachment.original_filename)
			return (
				(filter === 'all' || category === filter) &&
				attachment.original_filename.toLowerCase().includes(query)
			)
		})
	}, [attachments, filter, search])
	const pending = linkDevice.isPending || unlinkDevice.isPending
	const loading = deviceLoading || linkedLoading || attachmentsLoading

	function goBack() {
		void navigate({
			to: '/machines/$deviceId',
			params: { deviceId: String(id) },
		})
	}

	function toggleAttachment(attachmentId: number) {
		setSelectedIds((current) => {
			const ids = current ?? initialIds
			return ids.includes(attachmentId)
				? ids.filter((id) => id !== attachmentId)
				: [...ids, attachmentId]
		})
	}

	function toggleVisible(visibleIds: number[]) {
		if (visibleIds.length === 0) return
		setSelectedIds((current) => {
			const ids = current ?? initialIds
			return visibleIds.every((id) => ids.includes(id))
				? ids.filter((id) => !visibleIds.includes(id))
				: Array.from(new Set([...ids, ...visibleIds]))
		})
	}

	async function save() {
		const original = new Set(initialIds)
		const selected = new Set(currentSelectedIds)
		try {
			setError(null)
			await Promise.all([
				...currentSelectedIds
					.filter((attachmentId) => !original.has(attachmentId))
					.map((attachmentId) => linkDevice.mutateAsync({ attachmentId, deviceId: id })),
				...initialIds
					.filter((attachmentId) => !selected.has(attachmentId))
					.map((attachmentId) =>
						unlinkDevice.mutateAsync({ attachmentId, deviceId: id }),
					),
			])
			goBack()
		} catch (saveError) {
			setError(
				saveError instanceof Error
					? saveError.message
					: 'Nie udało się zapisać powiązanych dokumentów.',
			)
		}
	}

	return (
		<div className='add-machine-page machine-documents-page'>
			<div className='machine-wizard-content machine-documents-content'>
				<button type='button' className='machine-documents-back' onClick={goBack}>
					<ArrowLeft size={17} /> Wróć do szczegółów maszyny
				</button>
				<header className='machine-wizard-heading'>
					<h1>Wybór plików</h1>
					<p>
						Wybierz dokumenty, które mają zostać przypisane do maszyny
						{device ? ` „${device.name}”` : ''}.
					</p>
				</header>

				{loading ? (
					<div className='machine-documents-loading'>Ładowanie dokumentów…</div>
				) : !device ? (
					<div className='machine-documents-loading'>
						Nie udało się załadować maszyny.
					</div>
				) : (
					<>
						<div className='machine-document-toolbar'>
							<div>
								<Search size={18} />
								<input
									autoFocus
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder='Szukaj po nazwie pliku…'
								/>
							</div>
							<select
								value={filter}
								onChange={(event) =>
									setFilter(event.target.value as DocumentFilter)
								}>
								{DOCUMENT_FILTERS.map((value) => (
									<option key={value} value={value}>
										{value === 'all' ? 'Typ: wszystkie' : value}
									</option>
								))}
							</select>
						</div>
						<DocumentsTable
							attachments={filteredAttachments}
							selectedIds={currentSelectedIds}
							onToggle={toggleAttachment}
							onToggleVisible={toggleVisible}
						/>
					</>
				)}
				{error && <p className='machine-wizard-error'>{error}</p>}
			</div>

			<footer className='machine-wizard-footer'>
				<button
					type='button'
					className='machine-wizard-secondary'
					disabled={pending}
					onClick={goBack}>
					Anuluj
				</button>
				<span className='machine-wizard-footer-status'>
					Wybrano: <strong>{documentCountLabel(currentSelectedIds.length)}</strong>
				</span>
				<button
					type='button'
					className='machine-wizard-primary'
					disabled={pending || loading || !device}
					onClick={() => void save()}>
					{pending ? 'Zapisywanie…' : 'Zapisz zmiany'}
				</button>
			</footer>
		</div>
	)
}
