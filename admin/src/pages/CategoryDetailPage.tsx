import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import {
	useCategory,
	useCategoryChildren,
	useCategoryTree,
	useDeleteCategory,
	useUpdateCategory,
} from '@/hooks/useCategories'
import { useDevices } from '@/hooks/useDevices'
import { categoryPath, descendantIds, flattenCategoryTree } from '@/lib/categoryTree'
import { machineCountLabel } from '@/lib/pluralize'
import type { Category, Device } from '@/lib/types'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import {
	AlertTriangle,
	ArrowLeft,
	Edit3,
	FolderOpen,
	FolderPlus,
	Forklift,
	ImageIcon,
	Save,
	Trash2,
	XCircle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import './CategoryDetailPage.css'

type ParentOption = ReturnType<typeof flattenCategoryTree>[number]

function CatalogImageCard({ imageUrl, name }: { imageUrl: string; name: string }) {
	const [imageFailed, setImageFailed] = useState(false)

	useEffect(() => setImageFailed(false), [imageUrl])

	return (
		<section className='catalog-detail-card catalog-detail-image-card'>
			<header>
				<ImageIcon size={19} />
				<h2>Zdjęcie katalogu</h2>
			</header>
			<div className='catalog-detail-image-stage'>
				<div className='catalog-detail-image-frame'>
					{imageUrl.trim() && !imageFailed ? (
						<img
							src={imageUrl.trim()}
							alt={`Zdjęcie katalogu ${name}`}
							onError={() => setImageFailed(true)}
						/>
					) : (
						<div className='catalog-detail-image-empty'>
							<FolderOpen size={48} strokeWidth={1.6} />
							<span>
								{imageFailed ? 'Nie udało się wczytać zdjęcia' : 'Brak URL zdjęcia'}
							</span>
						</div>
					)}
				</div>
			</div>
		</section>
	)
}

function CatalogEditCard({
	dirty,
	error,
	imageUrl,
	name,
	onCancel,
	onImageUrlChange,
	onNameChange,
	onParentChange,
	onSave,
	parentId,
	parentOptions,
	savedMessage,
	saving,
}: {
	dirty: boolean
	error: string | null
	imageUrl: string
	name: string
	onCancel: () => void
	onImageUrlChange: (value: string) => void
	onNameChange: (value: string) => void
	onParentChange: (value: number | null) => void
	onSave: () => void
	parentId: number | null
	parentOptions: ParentOption[]
	savedMessage: string | null
	saving: boolean
}) {
	const actionsDisabled = saving || !dirty

	return (
		<section className='catalog-detail-card catalog-detail-edit-card'>
			<header>
				<div>
					<Edit3 size={19} />
					<h2>Edycja katalogu</h2>
				</div>
				{dirty ? (
					<span className='catalog-detail-status catalog-detail-status--dirty'>
						Niezapisane zmiany
					</span>
				) : savedMessage ? (
					<span className='catalog-detail-status catalog-detail-status--saved'>
						Zapisano
					</span>
				) : null}
			</header>

			<div className='catalog-detail-edit-body'>
				<label>
					<span>Nazwa katalogu</span>
					<input
						value={name}
						onChange={(event) => onNameChange(event.target.value)}
						placeholder='Nazwa katalogu'
					/>
				</label>
				<label>
					<span>Katalog nadrzędny</span>
					<select
						value={parentId ?? ''}
						onChange={(event) =>
							onParentChange(event.target.value ? Number(event.target.value) : null)
						}>
						<option value=''>Brak — katalog główny</option>
						{parentOptions.map((option) => (
							<option key={option.id} value={option.id}>
								{'\u00a0\u00a0'.repeat(option.depth)}
								{option.depth > 0 ? '↳ ' : ''}
								{option.name}
							</option>
						))}
					</select>
				</label>
				<label>
					<span>URL zdjęcia</span>
					<input
						type='url'
						value={imageUrl}
						onChange={(event) => onImageUrlChange(event.target.value)}
						placeholder='https://...'
					/>
				</label>
				{error && <p className='catalog-detail-form-error'>{error}</p>}
			</div>

			<footer>
				<button type='button' disabled={actionsDisabled} onClick={onCancel}>
					<XCircle size={15} />
					Anuluj
				</button>
				<button
					type='button'
					className='catalog-detail-save'
					disabled={actionsDisabled}
					onClick={onSave}>
					<Save size={15} />
					{saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
				</button>
			</footer>
		</section>
	)
}

function RelatedMachinesCard({ devices }: { devices: Device[] }) {
	return (
		<section className='catalog-detail-card catalog-detail-list-card'>
			<h2>Powiązane maszyny</h2>
			<div className='catalog-detail-machine-list'>
				{devices.length === 0 && (
					<div className='catalog-detail-empty-row'>
						<Forklift size={20} />
						<span>Brak maszyn powiązanych z tym katalogiem</span>
					</div>
				)}
				{devices.map((device) => (
					<Link
						key={device.id}
						to='/machines/$deviceId'
						params={{ deviceId: String(device.id) }}
						className='catalog-detail-machine-row'>
						<span className='catalog-detail-machine-image'>
							{device.image_url ? (
								<img src={device.image_url} alt='' />
							) : (
								<Forklift size={20} />
							)}
						</span>
						<span>{device.name}</span>
					</Link>
				))}
			</div>
		</section>
	)
}

function SubcatalogsCard({
	catalogId,
	subcatalogs,
}: {
	catalogId: number
	subcatalogs: Category[]
}) {
	return (
		<section className='catalog-detail-card catalog-detail-list-card'>
			<header className='catalog-detail-list-heading'>
				<h2>Podkatalogi</h2>
				<Link to='/categories/new' search={{ parentId: catalogId }}>
					<FolderPlus size={16} />
					Dodaj podkatalog
				</Link>
			</header>
			<div className='catalog-detail-subcatalog-list'>
				{subcatalogs.length === 0 && (
					<div className='catalog-detail-empty-row'>
						<FolderOpen size={20} />
						<span>Brak podkatalogów</span>
					</div>
				)}
				{subcatalogs.map((child) => (
					<Link
						key={child.id}
						to='/categories/$categoryId'
						params={{ categoryId: String(child.id) }}
						className='catalog-detail-subcatalog-row'>
						<FolderOpen size={20} />
						<span>{child.name}</span>
					</Link>
				))}
			</div>
		</section>
	)
}

function CatalogInfoCard({
	category,
	flat,
	relatedDevices,
}: {
	category: Category
	flat: ParentOption[]
	relatedDevices: Device[]
}) {
	const parentPath =
		category.parent_id === null ? 'Katalog główny' : categoryPath(category.parent_id, flat)

	return (
		<section className='catalog-detail-card catalog-detail-info-card'>
			<h2>Informacje o katalogu</h2>
			<dl>
				<div>
					<dt>Nazwa</dt>
					<dd>{category.name}</dd>
				</div>
				<div>
					<dt>Zdjęcie</dt>
					<dd>{category.image_url ? 'URL ustawiony' : 'Brak zdjęcia'}</dd>
				</div>
				<div>
					<dt>Katalog nadrzędny</dt>
					<dd>{parentPath}</dd>
				</div>
				<div>
					<dt>Powiązania</dt>
					<dd>{machineCountLabel(relatedDevices.length)}</dd>
				</div>
			</dl>
		</section>
	)
}

function DangerCard({ onDelete }: { onDelete: () => void }) {
	return (
		<section className='catalog-detail-card catalog-detail-danger-card'>
			<h2>Strefa niebezpieczna</h2>
			<p>Trwałe działania dotyczące katalogu.</p>
			<button type='button' onClick={onDelete}>
				<Trash2 size={16} />
				Usuń katalog
			</button>
			<small>
				<AlertTriangle size={14} />
				Po usunięciu katalog zniknie z drzewa katalogu maszyn.
			</small>
		</section>
	)
}

function CategoryDetailContent({
	category,
	subcatalogs,
	dirty,
	error,
	flat,
	imageUrl,
	name,
	onCancel,
	onDelete,
	onImageUrlChange,
	onNameChange,
	onParentChange,
	onSave,
	parentId,
	parentOptions,
	relatedDevices,
	savedMessage,
	saving,
}: {
	category: Category
	subcatalogs: Category[]
	dirty: boolean
	error: string | null
	flat: ParentOption[]
	imageUrl: string
	name: string
	onCancel: () => void
	onDelete: () => void
	onImageUrlChange: (value: string) => void
	onNameChange: (value: string) => void
	onParentChange: (value: number | null) => void
	onSave: () => void
	parentId: number | null
	parentOptions: ParentOption[]
	relatedDevices: Device[]
	savedMessage: string | null
	saving: boolean
}) {
	return (
		<div className='catalog-detail-page'>
			<div className='catalog-detail-content'>
				<Link to='/catalog' search={{ tab: 'categories' }} className='catalog-detail-back'>
					<ArrowLeft size={17} strokeWidth={2.5} />
					Wróć do katalogu
				</Link>
				<h1>Szczegóły katalogu</h1>
				<div className='catalog-detail-name'>{category.name}</div>

				<div className='catalog-detail-primary-grid'>
					<CatalogImageCard imageUrl={imageUrl} name={name || category.name} />
					<CatalogEditCard
						dirty={dirty}
						error={error}
						imageUrl={imageUrl}
						name={name}
						onCancel={onCancel}
						onImageUrlChange={onImageUrlChange}
						onNameChange={onNameChange}
						onParentChange={onParentChange}
						onSave={onSave}
						parentId={parentId}
						parentOptions={parentOptions}
						savedMessage={savedMessage}
						saving={saving}
					/>
				</div>

				<div className='catalog-detail-secondary-grid'>
					<div className='catalog-detail-main-column'>
						<RelatedMachinesCard devices={relatedDevices} />
						<SubcatalogsCard catalogId={category.id} subcatalogs={subcatalogs} />
					</div>
					<aside className='catalog-detail-side-column'>
						<CatalogInfoCard
							category={category}
							flat={flat}
							relatedDevices={relatedDevices}
						/>
						<DangerCard onDelete={onDelete} />
					</aside>
				</div>
			</div>
		</div>
	)
}

export function CategoryDetailPage() {
	const { categoryId } = useParams({ strict: false }) as { categoryId: string }
	const id = Number(categoryId)
	const navigate = useNavigate()
	const { data: category, isLoading } = useCategory(id)
	const { data: tree } = useCategoryTree()
	const { data: children } = useCategoryChildren(id)
	const { data: devices } = useDevices()
	const updateCategory = useUpdateCategory(id)
	const deleteCategory = useDeleteCategory()

	const [name, setName] = useState('')
	const [imageUrl, setImageUrl] = useState('')
	const [parentId, setParentId] = useState<number | null>(null)
	const [showDeleteModal, setShowDeleteModal] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [savedMessage, setSavedMessage] = useState<string | null>(null)

	useEffect(() => {
		if (!category) return
		setName(category.name)
		setImageUrl(category.image_url ?? '')
		setParentId(category.parent_id)
	}, [category])

	const flat = flattenCategoryTree(tree ?? [])
	const excluded = new Set([id, ...descendantIds(id, flat)])
	const parentOptions = flat.filter((item) => !excluded.has(item.id))
	const relatedDevices = devices?.filter((device) => device.category_id === id) ?? []
	const dirty = Boolean(
		category &&
		(name !== category.name ||
			imageUrl !== (category.image_url ?? '') ||
			parentId !== category.parent_id),
	)

	function changeName(value: string) {
		setName(value)
		setError(null)
		setSavedMessage(null)
	}

	function changeImageUrl(value: string) {
		setImageUrl(value)
		setError(null)
		setSavedMessage(null)
	}

	function changeParent(value: number | null) {
		setParentId(value)
		setError(null)
		setSavedMessage(null)
	}

	function resetDraft() {
		if (!category) return
		setName(category.name)
		setImageUrl(category.image_url ?? '')
		setParentId(category.parent_id)
		setError(null)
		setSavedMessage(null)
	}

	async function handleSave() {
		const trimmedName = name.trim()
		if (!trimmedName) {
			setError('Nazwa katalogu jest wymagana.')
			return
		}
		setError(null)
		setSavedMessage(null)
		try {
			await updateCategory.mutateAsync({
				name: trimmedName,
				image_url: imageUrl.trim() || null,
				parent_id: parentId,
			})
			setSavedMessage('Zapisano zmiany katalogu.')
		} catch (saveError) {
			setError(
				saveError instanceof Error ? saveError.message : 'Nie udało się zapisać zmian.',
			)
		}
	}

	async function handleDelete() {
		try {
			await deleteCategory.mutateAsync(id)
			void navigate({ to: '/catalog', search: { tab: 'categories' } })
		} catch (deleteError) {
			setError(
				deleteError instanceof Error
					? deleteError.message
					: 'Nie udało się usunąć katalogu.',
			)
			setShowDeleteModal(false)
		}
	}

	if (isLoading)
		return <div className='catalog-detail-message'>Ładowanie szczegółów katalogu…</div>
	if (!category)
		return (
			<div className='catalog-detail-message catalog-detail-message--error'>
				Nie znaleziono katalogu.
			</div>
		)

	return (
		<>
			<CategoryDetailContent
				category={category}
				subcatalogs={children ?? []}
				dirty={dirty}
				error={error}
				flat={flat}
				imageUrl={imageUrl}
				name={name}
				onCancel={resetDraft}
				onDelete={() => setShowDeleteModal(true)}
				onImageUrlChange={changeImageUrl}
				onNameChange={changeName}
				onParentChange={changeParent}
				onSave={() => void handleSave()}
				parentId={parentId}
				parentOptions={parentOptions}
				relatedDevices={relatedDevices}
				savedMessage={savedMessage}
				saving={updateCategory.isPending}
			/>
			{showDeleteModal && (
				<ConfirmDeleteModal
					title='Usuń katalog'
					description={`Katalog "${category.name}" zostanie trwale usunięty.`}
					pending={deleteCategory.isPending}
					onConfirm={() => void handleDelete()}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
		</>
	)
}
