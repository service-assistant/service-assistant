import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import { useCategoryTree } from '@/hooks/useCategories'
import { useDeleteDevice, useDevice, useDeviceAttachments } from '@/hooks/useDevices'
import { categoryPath, flattenCategoryTree } from '@/lib/categoryTree'
import { documentCountLabel } from '@/lib/pluralize'
import type { Attachment } from '@/lib/types'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	FileText,
	Forklift,
	Trash2,
	Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import './MachineDetailPage.css'

function formatDate(value: string) {
	return new Date(value).toLocaleDateString('pl-PL', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function StatusCard({ documentCount }: { documentCount: number }) {
	const ready = documentCount > 0
	return (
		<section
			className={`machine-status-card ${ready ? 'machine-status-card--ready' : 'machine-status-card--missing'}`}>
			<span className='machine-status-icon'>
				{ready ? (
					<CheckCircle2 size={21} strokeWidth={2.7} />
				) : (
					<AlertTriangle size={21} strokeWidth={2.5} />
				)}
			</span>
			<div>
				<strong>
					{ready ? 'Status: dokumentacja gotowa' : 'Status: wymaga dokumentów'}
				</strong>
				<p>
					{ready
						? 'Maszyna ma powiązane dokumenty i może być używana w bazie wiedzy.'
						: 'Do tej maszyny nie przypisano jeszcze żadnych dokumentów.'}
				</p>
			</div>
		</section>
	)
}

function InfoItem({ label, value }: { label: string; value: string }) {
	return (
		<div className='machine-info-item'>
			<dt>{label}</dt>
			<dd>{value}</dd>
		</div>
	)
}

function MachineInfoCard({
	category,
	documentCount,
	model,
	serial,
}: {
	category: string
	documentCount: number
	model: string
	serial: string | null
}) {
	return (
		<section className='machine-side-card machine-info-card'>
			<h2>Informacje o maszynie</h2>
			<dl>
				<InfoItem label='Maszyna' value={model} />
				<InfoItem label='Numer maszyny' value={serial || 'Brak danych'} />
				<InfoItem label='Katalog' value={category} />
				<InfoItem label='Używa dokumentów' value={documentCountLabel(documentCount)} />
			</dl>
		</section>
	)
}

function DocumentRow({ attachment }: { attachment: Attachment }) {
	return (
		<Link
			to='/documents/$attachmentId'
			params={{ attachmentId: String(attachment.id) }}
			className='machine-document-row'>
			<span className='machine-document-icon'>
				<FileText size={20} />
			</span>
			<span className='machine-document-copy'>
				<strong title={attachment.original_filename}>{attachment.original_filename}</strong>
				<small>Dodano: {formatDate(attachment.created_at)}</small>
			</span>
		</Link>
	)
}

function RelatedDocumentsCard({
	linkedAttachments,
	onEdit,
}: {
	linkedAttachments: Attachment[]
	onEdit: () => void
}) {
	return (
		<section className='machine-side-card machine-documents-card'>
			<header>
				<h2>Powiązane dokumenty</h2>
				<button type='button' onClick={onEdit}>
					Zmień
				</button>
			</header>
			<div className='machine-document-list'>
				{linkedAttachments.length === 0 && (
					<p className='machine-empty-documents'>Brak powiązanych dokumentów.</p>
				)}
				{linkedAttachments.map((attachment) => (
					<DocumentRow key={attachment.id} attachment={attachment} />
				))}
			</div>
		</section>
	)
}

function DangerCard({ onDelete }: { onDelete: () => void }) {
	return (
		<section className='machine-side-card machine-danger-card'>
			<h2>Strefa niebezpieczna</h2>
			<p>Trwałe działania dotyczące maszyny.</p>
			<button type='button' onClick={onDelete}>
				<Trash2 size={16} /> Usuń maszynę
			</button>
			<small>
				<AlertTriangle size={14} /> Po usunięciu maszyna zniknie z katalogu.
			</small>
		</section>
	)
}

export function MachineDetailPage() {
	const { deviceId } = useParams({ strict: false }) as { deviceId: string }
	const id = Number(deviceId)
	const navigate = useNavigate()
	const { data: device, isLoading } = useDevice(id)
	const { data: tree } = useCategoryTree()
	const { data: linkedAttachments } = useDeviceAttachments(id)
	const deleteDevice = useDeleteDevice()
	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const flat = useMemo(() => flattenCategoryTree(tree ?? []), [tree])
	const category = device ? categoryPath(device.category_id, flat) : '—'
	const documents = linkedAttachments ?? []

	async function handleDelete() {
		try {
			await deleteDevice.mutateAsync(id)
			void navigate({ to: '/catalog', search: { tab: 'models' } })
		} catch (deleteError) {
			setError(
				deleteError instanceof Error
					? deleteError.message
					: 'Nie udało się usunąć maszyny.',
			)
			setShowDeleteModal(false)
		}
	}

	if (isLoading)
		return <div className='machine-detail-message'>Ładowanie szczegółów maszyny…</div>
	if (!device)
		return (
			<div className='machine-detail-message machine-detail-message--error'>
				Nie znaleziono maszyny.
			</div>
		)

	return (
		<div className='machine-detail-page'>
			<div className='machine-detail-content'>
				<Link to='/catalog' search={{ tab: 'models' }} className='machine-back-button'>
					<ArrowLeft size={17} /> Wróć do katalogu
				</Link>
				<h1>Szczegóły maszyny</h1>
				{error && <p className='machine-detail-error'>{error}</p>}

				<div className='machine-detail-layout'>
					<section className='machine-image-card'>
						<header>
							<Wrench size={18} />
							<h2>Obraz maszyny</h2>
						</header>
						<div className='machine-image-stage'>
							<div className='machine-image-frame'>
								{device.image_url ? (
									<img src={device.image_url} alt={`Maszyna ${device.name}`} />
								) : (
									<div className='machine-image-placeholder'>
										<Forklift size={64} />
										<span>Brak zdjęcia maszyny</span>
									</div>
								)}
							</div>
						</div>
						<footer>
							<strong>{device.name}</strong>
							<span>{category}</span>
						</footer>
					</section>

					<aside className='machine-detail-sidebar'>
						<StatusCard documentCount={documents.length} />
						<MachineInfoCard
							category={category}
							documentCount={documents.length}
							model={device.name}
							serial={device.model_serial_code}
						/>
						<RelatedDocumentsCard
							linkedAttachments={documents}
							onEdit={() =>
								void navigate({
									to: '/machines/$deviceId/documents',
									params: { deviceId: String(id) },
								})
							}
						/>
						<DangerCard onDelete={() => setShowDeleteModal(true)} />
					</aside>
				</div>
			</div>

			{showDeleteModal && (
				<ConfirmDeleteModal
					title='Usuń maszynę'
					description={`Maszyna „${device.name}” zostanie trwale usunięta.`}
					pending={deleteDevice.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
		</div>
	)
}
