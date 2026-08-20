import { useCategoryTree, useCreateCategory } from '@/hooks/useCategories'
import { flattenCategoryTree } from '@/lib/categoryTree'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, FolderPlus, ImageIcon, Plus } from 'lucide-react'
import { useState } from 'react'
import './CategoryNewPage.css'

export function CategoryNewPage() {
	const navigate = useNavigate()
	const { parentId } = useSearch({ strict: false }) as { parentId?: number }
	const { data: tree } = useCategoryTree()
	const createCategory = useCreateCategory()

	const [name, setName] = useState('')
	const [imageUrl, setImageUrl] = useState('')
	const [selectedParentId, setSelectedParentId] = useState<number | null>(parentId ?? null)
	const [error, setError] = useState<string | null>(null)
	const [previewFailed, setPreviewFailed] = useState(false)

	const flat = flattenCategoryTree(tree ?? [])
	const trimmedName = name.trim()
	const trimmedImageUrl = imageUrl.trim()
	const previewLetter = trimmedName.charAt(0).toUpperCase() || '?'

	async function handleSubmit() {
		if (!trimmedName) {
			setError('Nazwa katalogu jest wymagana.')
			return
		}
		setError(null)
		try {
			await createCategory.mutateAsync({
				name: trimmedName,
				image_url: trimmedImageUrl || null,
				parent_id: selectedParentId,
			})
			void navigate({ to: '/catalog', search: { tab: 'categories' } })
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nie udało się dodać katalogu.')
		}
	}

	function handleImageUrlChange(value: string) {
		setImageUrl(value)
		setPreviewFailed(false)
	}

	return (
		<div className='category-new-page'>
			<div className='category-new-content'>
				<Link to='/catalog' search={{ tab: 'categories' }} className='category-new-back'>
					<ArrowLeft size={17} strokeWidth={2.5} />
					Wróć do katalogu
				</Link>

				<header className='category-new-heading'>
					<h1>Dodaj katalog</h1>
					<p>Utwórz katalog dostępny później przy porządkowaniu maszyn i dokumentów.</p>
				</header>

				<div className='category-new-layout'>
					<section className='category-new-card category-new-form-card'>
						<header>
							<FolderPlus size={21} strokeWidth={2.2} />
							<h2>Dane katalogu</h2>
						</header>

						<div className='category-new-field'>
							<label htmlFor='category-name'>Nazwa katalogu</label>
							<input
								id='category-name'
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder='np. Wózki widłowe'
								autoFocus
							/>
						</div>

						<div className='category-new-field'>
							<label htmlFor='category-parent'>Katalog nadrzędny (opcjonalnie)</label>
							<select
								id='category-parent'
								value={selectedParentId ?? ''}
								onChange={(event) =>
									setSelectedParentId(
										event.target.value ? Number(event.target.value) : null,
									)
								}>
								<option value=''>Brak — katalog główny</option>
								{flat.map((category) => (
									<option key={category.id} value={category.id}>
										{'\u00a0\u00a0'.repeat(category.depth)}
										{category.depth > 0 ? '↳ ' : ''}
										{category.name}
									</option>
								))}
							</select>
						</div>

						<div className='category-new-field'>
							<label htmlFor='category-image'>URL zdjęcia (opcjonalnie)</label>
							<input
								id='category-image'
								type='url'
								value={imageUrl}
								onChange={(event) => handleImageUrlChange(event.target.value)}
								placeholder='https://...'
							/>
							<p className='category-new-hint'>
								W bazie zostanie zapisany wyłącznie adres URL.
							</p>
						</div>

						{error && <p className='category-new-error'>{error}</p>}

						<footer>
							<Link
								to='/catalog'
								search={{ tab: 'categories' }}
								className='category-new-cancel'>
								Anuluj
							</Link>
							<button
								type='button'
								onClick={() => void handleSubmit()}
								disabled={createCategory.isPending}>
								<Plus size={16} strokeWidth={2.5} />
								{createCategory.isPending ? 'Dodawanie…' : 'Dodaj katalog'}
							</button>
						</footer>
					</section>

					<aside className='category-new-card category-new-preview-card'>
						<h2>Podgląd zdjęcia</h2>
						<div className='category-new-preview'>
							{trimmedImageUrl && !previewFailed ? (
								<img
									src={trimmedImageUrl}
									alt={`Podgląd katalogu ${trimmedName || 'bez nazwy'}`}
									onError={() => setPreviewFailed(true)}
								/>
							) : (
								<div
									className='category-new-placeholder'
									aria-label='Brak zdjęcia katalogu'>
									{trimmedName ? (
										<span>{previewLetter}</span>
									) : (
										<ImageIcon size={29} strokeWidth={1.8} />
									)}
								</div>
							)}
						</div>
						{previewFailed && (
							<p className='category-new-preview-error'>
								Nie udało się wczytać zdjęcia z tego URL.
							</p>
						)}
					</aside>
				</div>
			</div>
		</div>
	)
}
