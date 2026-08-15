import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal'
import {
	useCategory,
	useCategoryChildren,
	useCategoryTree,
	useDeleteCategory,
	useUpdateCategory,
} from '@/hooks/useCategories'
import { useDevices } from '@/hooks/useDevices'
import { descendantIds, flattenCategoryTree } from '@/lib/categoryTree'
import { machineCountLabel } from '@/lib/pluralize'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

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

	useEffect(() => {
		if (category) {
			setName(category.name)
			setImageUrl(category.image_url ?? '')
			setParentId(category.parent_id)
		}
	}, [category])

	const flat = flattenCategoryTree(tree ?? [])
	const excluded = new Set([id, ...descendantIds(id, flat)])
	const parentOptions = flat.filter((c) => !excluded.has(c.id))

	const relatedDevices = devices?.filter((d) => d.category_id === id) ?? []
	const dirty =
		category &&
		(name !== category.name ||
			imageUrl !== (category.image_url ?? '') ||
			parentId !== category.parent_id)

	async function handleSave() {
		setError(null)
		try {
			await updateCategory.mutateAsync({
				name,
				image_url: imageUrl || null,
				parent_id: parentId,
			})
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się zapisać zmian.')
		}
	}

	async function handleDelete() {
		try {
			await deleteCategory.mutateAsync(id)
			void navigate({ to: '/catalog', search: { tab: 'categories' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się usunąć kategorii.')
			setShowDeleteModal(false)
		}
	}

	if (isLoading || !category) return <div className='text-cream/50'>Ładowanie…</div>

	return (
		<div className='mx-auto max-w-3xl'>
			<Link
				to='/catalog'
				search={{ tab: 'categories' }}
				className='mb-4 inline-block text-sm text-cream/60 hover:text-cream'>
				← Wróć do katalogu
			</Link>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>{category.name}</h1>

			<div className='mb-6 space-y-4 rounded-lg border border-line bg-panel p-6'>
				<h2 className='text-sm font-medium text-cream'>Informacje o kategorii</h2>
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
						Kategoria nadrzędna
					</label>
					<select
						value={parentId ?? ''}
						onChange={(e) =>
							setParentId(e.target.value ? Number(e.target.value) : null)
						}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream'>
						<option value=''>— brak (kategoria główna) —</option>
						{parentOptions.map((c) => (
							<option key={c.id} value={c.id}>
								{'  '.repeat(c.depth)}
								{c.depth > 0 ? '↳ ' : ''}
								{c.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label className='mb-1 block text-xs uppercase tracking-wide text-cream/50'>
						URL zdjęcia (opcjonalnie)
					</label>
					<input
						value={imageUrl}
						onChange={(e) => setImageUrl(e.target.value)}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream outline-none focus:border-ember'
					/>
					{imageUrl && (
						<img src={imageUrl} alt='' className='mt-2 h-16 rounded object-contain' />
					)}
				</div>
				{error && <p className='text-sm text-red-400'>{error}</p>}
				<div className='flex gap-2'>
					<button
						onClick={handleSave}
						disabled={!dirty || updateCategory.isPending}
						className='rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40'>
						{updateCategory.isPending ? 'Zapisywanie…' : 'Zapisz'}
					</button>
					{dirty && (
						<button
							onClick={() => {
								setName(category.name)
								setImageUrl(category.image_url ?? '')
								setParentId(category.parent_id)
							}}
							className='rounded-md px-4 py-2 text-sm text-cream/60 hover:text-cream'>
							Anuluj
						</button>
					)}
				</div>
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<div className='mb-3 flex items-center justify-between'>
					<h2 className='text-sm font-medium text-cream'>
						Podkategorie ({children?.length ?? 0})
					</h2>
					<Link
						to='/categories/new'
						search={{ parentId: id }}
						className='text-sm text-ember hover:underline'>
						+ Dodaj podkategorię
					</Link>
				</div>
				{(children?.length ?? 0) === 0 && (
					<p className='text-sm text-cream/50'>Brak podkategorii.</p>
				)}
				<div className='space-y-1'>
					{children?.map((child) => (
						<Link
							key={child.id}
							to='/categories/$categoryId'
							params={{ categoryId: String(child.id) }}
							className='block rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft hover:text-cream'>
							{child.name}
						</Link>
					))}
				</div>
			</div>

			<div className='mb-6 rounded-lg border border-line bg-panel p-6'>
				<h2 className='mb-3 text-sm font-medium text-cream'>
					Powiązane maszyny ({machineCountLabel(relatedDevices.length)})
				</h2>
				{relatedDevices.length === 0 && (
					<p className='text-sm text-cream/50'>Brak powiązanych maszyn.</p>
				)}
				<div className='space-y-1'>
					{relatedDevices.map((device) => (
						<Link
							key={device.id}
							to='/machines/$deviceId'
							params={{ deviceId: String(device.id) }}
							className='block rounded-md px-2 py-2 text-sm text-cream/80 hover:bg-panel-soft hover:text-cream'>
							{device.name}
						</Link>
					))}
				</div>
			</div>

			<div className='rounded-lg border border-red-900/40 bg-panel p-6'>
				<h2 className='mb-2 text-sm font-medium text-red-300'>Strefa niebezpieczna</h2>
				<p className='mb-3 text-sm text-cream/50'>
					Usunięcie kategorii jest nieodwracalne. Kategorii z podkategoriami nie można
					usunąć — usuń najpierw podkategorie.
				</p>
				<button
					onClick={() => setShowDeleteModal(true)}
					className='rounded-md border border-red-700 px-4 py-2 text-sm text-red-300 hover:bg-red-900/20'>
					Usuń kategorię
				</button>
			</div>

			{showDeleteModal && (
				<ConfirmDeleteModal
					title='Usuń kategorię'
					description={`Kategoria "${category.name}" zostanie trwale usunięta.`}
					pending={deleteCategory.isPending}
					onConfirm={handleDelete}
					onClose={() => setShowDeleteModal(false)}
				/>
			)}
		</div>
	)
}
