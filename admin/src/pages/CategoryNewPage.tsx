import { useCategoryTree, useCreateCategory } from '@/hooks/useCategories'
import { flattenCategoryTree } from '@/lib/categoryTree'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

export function CategoryNewPage() {
	const navigate = useNavigate()
	const { parentId } = useSearch({ strict: false }) as { parentId?: number }
	const { data: tree } = useCategoryTree()
	const createCategory = useCreateCategory()

	const [name, setName] = useState('')
	const [imageUrl, setImageUrl] = useState('')
	const [selectedParentId, setSelectedParentId] = useState<number | null>(parentId ?? null)
	const [error, setError] = useState<string | null>(null)

	const flat = flattenCategoryTree(tree ?? [])

	async function handleSubmit() {
		if (!name) {
			setError('Nazwa kategorii jest wymagana.')
			return
		}
		setError(null)
		try {
			await createCategory.mutateAsync({
				name,
				image_url: imageUrl || null,
				parent_id: selectedParentId,
			})
			void navigate({ to: '/catalog', search: { tab: 'categories' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać kategorii.')
		}
	}

	return (
		<div className='mx-auto max-w-lg'>
			<h1 className='mb-6 text-2xl font-semibold text-cream'>Dodaj kategorię</h1>
			<div className='mb-6 space-y-4 rounded-lg border border-line bg-panel p-6'>
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
						Kategoria nadrzędna (opcjonalnie)
					</label>
					<select
						value={selectedParentId ?? ''}
						onChange={(e) =>
							setSelectedParentId(e.target.value ? Number(e.target.value) : null)
						}
						className='w-full rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-cream'>
						<option value=''>— brak (kategoria główna) —</option>
						{flat.map((c) => (
							<option key={c.id} value={c.id}>
								{'  '.repeat(c.depth)}
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
			</div>
			{error && <p className='mb-4 text-sm text-red-400'>{error}</p>}
			<button
				onClick={handleSubmit}
				disabled={createCategory.isPending}
				className='w-full rounded-md bg-ember px-4 py-2 text-sm font-medium text-ink disabled:opacity-40'>
				{createCategory.isPending ? 'Zapisywanie…' : 'Dodaj kategorię'}
			</button>
		</div>
	)
}
