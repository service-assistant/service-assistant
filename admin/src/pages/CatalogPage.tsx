import { useCategoryTree, useMoveCategory } from '@/hooks/useCategories'
import { useDevices, useMoveDevice } from '@/hooks/useDevices'
import { flattenCategoryTree } from '@/lib/categoryTree'
import type { CategoryTree, Device } from '@/lib/types'
import { Link, useNavigate } from '@tanstack/react-router'
import {
	AlertTriangle,
	Building2,
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	FolderPlus,
	Forklift,
	Hammer,
	Layers3,
	Plus,
	Search,
	type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import './CatalogPage.css'

const CATALOG_TILE_COLORS = {
	blue: '#8ed7ff',
	purple: '#a78bfa',
	green: '#27d884',
	red: '#ff5d5d',
} as const

type DraggedItem = { id: number; kind: 'category' | 'device' }

function CatalogAddMenu({
	categoryId,
	categoryName,
}: {
	categoryId: number | null
	categoryName: string
}) {
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		function closeOnPointerDown(event: PointerEvent) {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
		}
		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('pointerdown', closeOnPointerDown)
		document.addEventListener('keydown', closeOnEscape)
		return () => {
			document.removeEventListener('pointerdown', closeOnPointerDown)
			document.removeEventListener('keydown', closeOnEscape)
		}
	}, [open])

	return (
		<div className='catalog-tree-add-menu' ref={containerRef}>
			<button
				type='button'
				className='catalog-tree-action catalog-tree-add'
				onClick={() => setOpen((current) => !current)}
				title={`Dodaj do ${categoryName}`}
				aria-label={`Dodaj do ${categoryName}`}
				aria-haspopup='menu'
				aria-expanded={open}>
				<Plus size={21} />
			</button>
			{open && (
				<div className='catalog-tree-add-menu__popup' role='menu'>
					<button
						type='button'
						role='menuitem'
						onClick={() => {
							setOpen(false)
							void navigate({
								to: '/categories/new',
								search: categoryId === null ? {} : { parentId: categoryId },
							})
						}}>
						<FolderPlus size={18} />
						<span>Dodaj podkatalog</span>
					</button>
					<button
						type='button'
						role='menuitem'
						onClick={() => {
							setOpen(false)
							void navigate({
								to: '/add-machine',
								search: categoryId === null ? {} : { categoryId },
							})
						}}>
						<Forklift size={18} />
						<span>Dodaj maszynę</span>
					</button>
				</div>
			)}
		</div>
	)
}

function CatalogStatTile({
	color,
	description,
	icon: Icon,
	label,
	value,
}: {
	color: keyof typeof CATALOG_TILE_COLORS
	description: string
	icon: LucideIcon
	label: string
	value: number
}) {
	const accent = CATALOG_TILE_COLORS[color]
	return (
		<div className='catalog-stat-tile'>
			<div className='catalog-stat-tile__top'>
				<div className='catalog-stat-tile__label'>
					<span className='catalog-stat-tile__dot' style={{ backgroundColor: accent }} />
					{label}
				</div>
				<Icon size={18} color={accent} strokeWidth={2.3} />
			</div>
			<div className='catalog-stat-tile__value-row'>
				<span className='catalog-stat-tile__value'>{value}</span>
				<span
					className='catalog-stat-tile__description'
					style={color === 'red' ? { color: '#ffaaa8' } : undefined}>
					{description}
				</span>
			</div>
		</div>
	)
}

function writeDraggedItem(event: DragEvent, item: DraggedItem) {
	event.stopPropagation()
	document.documentElement.classList.add('catalog-tree-is-dragging')
	event.dataTransfer.clearData()
	event.dataTransfer.effectAllowed = 'move'
	event.dataTransfer.setData('application/x-fixo-catalog-item', JSON.stringify(item))

	const name = event.currentTarget.querySelector('.catalog-tree-name')
	if (name) {
		const preview = document.createElement('div')
		preview.className = `catalog-tree-drag-preview catalog-tree-drag-preview--${item.kind}`
		preview.append(name.cloneNode(true))
		document.body.append(preview)
		event.dataTransfer.setDragImage(preview, 18, 22)
		setTimeout(() => preview.remove(), 0)
	}
}

function finishDragging() {
	document.documentElement.classList.remove('catalog-tree-is-dragging')
}

function readDraggedItem(event: DragEvent): DraggedItem | undefined {
	try {
		const value = JSON.parse(
			event.dataTransfer.getData('application/x-fixo-catalog-item'),
		) as Partial<DraggedItem>
		if (
			typeof value.id === 'number' &&
			(value.kind === 'category' || value.kind === 'device')
		) {
			return value as DraggedItem
		}
	} catch {
		return undefined
	}
	return undefined
}

function DeviceTreeRow({ device, depth }: { device: Device; depth: number }) {
	const [imageOpen, setImageOpen] = useState(false)

	return (
		<div
			className={`catalog-tree-row catalog-tree-row--device ${imageOpen ? 'catalog-tree-row--device-open' : ''}`}
			data-depth={depth}
			draggable
			onDragStart={(event) => writeDraggedItem(event, { id: device.id, kind: 'device' })}
			onDragEnd={finishDragging}
			style={{ '--tree-depth': depth } as CSSProperties}
			onDragOver={(event) => {
				event.preventDefault()
				event.stopPropagation()
				event.dataTransfer.dropEffect = 'move'
			}}
			onDrop={(event) => {
				event.preventDefault()
				event.stopPropagation()
			}}>
			<button
				type='button'
				className='catalog-tree-toggle'
				onClick={() => setImageOpen((current) => !current)}
				aria-label={imageOpen ? 'Zmniejsz podgląd maszyny' : 'Powiększ podgląd maszyny'}>
				{imageOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
			</button>
			<div className='catalog-tree-name catalog-tree-name--device'>
				<span
					className={`catalog-tree-thumbnail ${imageOpen ? 'catalog-tree-thumbnail--open' : ''}`}>
					{device.image_url ? (
						<img src={device.image_url} alt='' draggable={false} />
					) : (
						<Forklift size={20} />
					)}
				</span>
				<span>
					<Link
						to='/machines/$deviceId'
						params={{ deviceId: String(device.id) }}
						draggable={false}
						className='catalog-tree-label'
						title={`Otwórz maszynę ${device.name}`}>
						{device.name}
					</Link>
				</span>
			</div>
		</div>
	)
}

function CategoryTreeRow({
	category,
	depth,
	devicesByCategory,
	expanded,
	onDrop,
	onToggle,
}: {
	category: CategoryTree
	depth: number
	devicesByCategory: Map<number, Device[]>
	expanded: Set<number>
	onDrop: (item: DraggedItem, categoryId: number) => void
	onToggle: (categoryId: number) => void
}) {
	const open = expanded.has(category.id)
	const devices = devicesByCategory.get(category.id) ?? []
	const childCount = category.children.length + devices.length
	const [dragOver, setDragOver] = useState(false)
	const expandTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	useEffect(
		() => () => {
			if (expandTimer.current) clearTimeout(expandTimer.current)
		},
		[],
	)

	function enterDropTarget(event: DragEvent) {
		event.preventDefault()
		event.stopPropagation()
		setDragOver(true)
		if (!open && !expandTimer.current) {
			expandTimer.current = setTimeout(() => {
				onToggle(category.id)
				expandTimer.current = undefined
			}, 650)
		}
	}

	function leaveDropTarget(event: DragEvent) {
		event.stopPropagation()
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
		setDragOver(false)
		if (expandTimer.current) {
			clearTimeout(expandTimer.current)
			expandTimer.current = undefined
		}
	}

	return (
		<>
			<div
				className={`catalog-tree-row catalog-tree-row--folder ${dragOver ? 'catalog-tree-row--drop-target' : ''}`}
				data-depth={depth}
				draggable
				onDragStart={(event) =>
					writeDraggedItem(event, { id: category.id, kind: 'category' })
				}
				onDragEnd={finishDragging}
				style={{ '--tree-depth': depth } as CSSProperties}
				onDragEnter={enterDropTarget}
				onDragLeave={leaveDropTarget}
				onDragOver={(event) => {
					event.preventDefault()
					event.stopPropagation()
					event.dataTransfer.dropEffect = 'move'
				}}
				onDrop={(event) => {
					event.preventDefault()
					event.stopPropagation()
					setDragOver(false)
					if (expandTimer.current) clearTimeout(expandTimer.current)
					const item = readDraggedItem(event)
					if (item) onDrop(item, category.id)
				}}>
				<button
					type='button'
					className='catalog-tree-toggle'
					onClick={() => onToggle(category.id)}
					aria-label={open ? 'Zwiń katalog' : 'Rozwiń katalog'}>
					{open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
				</button>
				<div className='catalog-tree-name catalog-tree-name--folder'>
					{open ? <FolderOpen size={22} /> : <Folder size={22} />}
					<Link
						to='/categories/$categoryId'
						params={{ categoryId: String(category.id) }}
						draggable={false}
						className='catalog-tree-label'
						title={`Otwórz katalog ${category.name}`}>
						{category.name}
					</Link>
					<small>{childCount}</small>
				</div>
				<CatalogAddMenu categoryId={category.id} categoryName={category.name} />
				<span className='catalog-tree-drop-label'>Przenieś tutaj</span>
			</div>

			{open && childCount > 0 && (
				<div
					className='catalog-tree-children'
					style={{ '--parent-depth': depth } as CSSProperties}>
					{category.children.map((child) => (
						<CategoryTreeRow
							key={child.id}
							category={child}
							depth={depth + 1}
							devicesByCategory={devicesByCategory}
							expanded={expanded}
							onDrop={onDrop}
							onToggle={onToggle}
						/>
					))}
					{devices.map((device) => (
						<DeviceTreeRow key={device.id} device={device} depth={depth + 1} />
					))}
				</div>
			)}
		</>
	)
}

export function CatalogPage() {
	const { data: devices, isLoading: devicesLoading } = useDevices()
	const { data: tree, isLoading: treeLoading } = useCategoryTree()
	const moveCategory = useMoveCategory()
	const moveDevice = useMoveDevice()
	const flatCategories = flattenCategoryTree(tree ?? [])
	const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
	const initializedExpansion = useRef(false)
	const [rootOpen, setRootOpen] = useState(true)
	const [rootDragOver, setRootDragOver] = useState(false)
	const [search, setSearch] = useState('')
	const [error, setError] = useState<string>()

	const brandCount = flatCategories.filter((category) => category.depth === 0).length
	const typeCount = new Set(
		flatCategories.filter((category) => category.depth > 0).map((category) => category.name),
	).size
	const unassignedDevices = devices?.filter((device) => device.category_id === null) ?? []
	const devicesByCategory = useMemo(() => {
		const grouped = new Map<number, Device[]>()
		for (const device of devices ?? []) {
			if (device.category_id === null) continue
			const items = grouped.get(device.category_id) ?? []
			items.push(device)
			grouped.set(device.category_id, items)
		}
		return grouped
	}, [devices])

	useEffect(() => {
		if (initializedExpansion.current || flatCategories.length === 0) return
		initializedExpansion.current = true
		setExpanded(new Set(flatCategories.map((category) => category.id)))
	}, [flatCategories])

	const visibleTree = useMemo(() => {
		const query = search.trim().toLowerCase()
		if (!query) return tree ?? []
		function filterCategory(category: CategoryTree): CategoryTree | undefined {
			const children = category.children
				.map(filterCategory)
				.filter((child): child is CategoryTree => child !== undefined)
			const matchingDevices = (devicesByCategory.get(category.id) ?? []).some((device) =>
				device.name.toLowerCase().includes(query),
			)
			if (
				category.name.toLowerCase().includes(query) ||
				matchingDevices ||
				children.length > 0
			) {
				return { ...category, children }
			}
			return undefined
		}
		return (tree ?? [])
			.map(filterCategory)
			.filter((category): category is CategoryTree => category !== undefined)
	}, [devicesByCategory, search, tree])

	function toggleCategory(categoryId: number) {
		setExpanded((current) => {
			const next = new Set(current)
			if (next.has(categoryId)) next.delete(categoryId)
			else next.add(categoryId)
			return next
		})
	}

	async function moveItem(item: DraggedItem, parentId: number | null) {
		if (item.kind === 'category' && item.id === parentId) return
		setError(undefined)
		if (item.kind === 'device' && parentId === null) {
			setError(
				'Maszyna nie może zostać przeniesiona do katalogu głównego. Musi znajdować się w podkatalogu.',
			)
			return
		}
		try {
			if (item.kind === 'category') {
				await moveCategory.mutateAsync({ categoryId: item.id, parentId })
			} else {
				await moveDevice.mutateAsync({ deviceId: item.id, categoryId: parentId })
			}
			if (parentId !== null) setExpanded((current) => new Set(current).add(parentId))
		} catch (moveError) {
			setError(
				moveError instanceof Error
					? moveError.message
					: 'Nie udało się przenieść elementu.',
			)
		}
	}

	return (
		<div
			className='catalog-page'
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes('application/x-fixo-catalog-item')) return
				event.preventDefault()
				event.dataTransfer.dropEffect = 'move'
			}}
			onDrop={(event) => {
				if (event.dataTransfer.types.includes('application/x-fixo-catalog-item')) {
					event.preventDefault()
				}
			}}>
			<header className='catalog-page-header'>
				<h1>Katalog maszyn</h1>
				<p>
					Zarządzaj strukturą katalogów i maszynami używanymi w dokumentach oraz
					asystencie.
				</p>
				<div className='catalog-page-header__meta'>
					<strong>{brandCount}</strong> marek · <strong>{typeCount}</strong> typów ·{' '}
					<strong>{devices?.length ?? 0}</strong> maszyn
				</div>
			</header>

			<div className='catalog-stats'>
				<CatalogStatTile
					label='Marki'
					value={brandCount}
					description='aktywnych'
					icon={Building2}
					color='blue'
				/>
				<CatalogStatTile
					label='Typy maszyn'
					value={typeCount}
					description='katalogi'
					icon={Layers3}
					color='purple'
				/>
				<CatalogStatTile
					label='Maszyny'
					value={devices?.length ?? 0}
					description='w katalogu'
					icon={Hammer}
					color='green'
				/>
				<CatalogStatTile
					label='Nieprzypisane'
					value={unassignedDevices.length}
					description='wymagają uwagi'
					icon={AlertTriangle}
					color='red'
				/>
			</div>

			<section className='catalog-explorer'>
				<div className='catalog-explorer__heading'>
					<div>
						<h2>Struktura katalogu</h2>
						<p>Przeciągnij katalog lub maszynę, aby zmienić jej położenie.</p>
					</div>
					<div className='catalog-explorer__heading-actions'>
						<Link to='/add-machine' className='catalog-explorer__secondary-button'>
							Dodaj maszynę
						</Link>
						<Link to='/categories/new' className='catalog-explorer__primary-button'>
							Dodaj katalog
						</Link>
					</div>
				</div>

				<div className='catalog-explorer__search'>
					<Search size={18} />
					<input
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder='Szukaj katalogu lub maszyny…'
					/>
				</div>

				{error && (
					<p className='catalog-explorer__error' role='alert'>
						{error}
					</p>
				)}
				{(treeLoading || devicesLoading) && (
					<p className='catalog-explorer__empty'>Ładowanie katalogu…</p>
				)}
				{!treeLoading && !devicesLoading && (
					<div className='catalog-tree'>
						<div
							className={`catalog-tree-row catalog-tree-row--folder catalog-tree-row--root ${rootDragOver ? 'catalog-tree-row--drop-target' : ''}`}
							data-depth={0}
							style={{ '--tree-depth': 0 } as CSSProperties}
							onDragEnter={(event) => {
								event.preventDefault()
								event.stopPropagation()
								setRootDragOver(true)
							}}
							onDragLeave={(event) => {
								event.stopPropagation()
								if (
									event.currentTarget.contains(event.relatedTarget as Node | null)
								)
									return
								setRootDragOver(false)
							}}
							onDragOver={(event) => {
								event.preventDefault()
								event.stopPropagation()
								event.dataTransfer.dropEffect = 'move'
							}}
							onDrop={(event) => {
								event.preventDefault()
								event.stopPropagation()
								setRootDragOver(false)
								const item = readDraggedItem(event)
								if (item) void moveItem(item, null)
							}}>
							<button
								type='button'
								className='catalog-tree-toggle'
								onClick={() => setRootOpen((current) => !current)}
								aria-label={rootOpen ? 'Zwiń katalog' : 'Rozwiń katalog'}>
								{rootOpen || search ? (
									<ChevronDown size={20} />
								) : (
									<ChevronRight size={20} />
								)}
							</button>
							<div className='catalog-tree-name catalog-tree-name--folder catalog-tree-name--root'>
								{rootOpen || search ? (
									<FolderOpen size={23} />
								) : (
									<Folder size={23} />
								)}
								<span>Katalog maszyn</span>
								<small>{(tree?.length ?? 0) + unassignedDevices.length}</small>
							</div>
							<CatalogAddMenu categoryId={null} categoryName='Katalog maszyn' />
							<span className='catalog-tree-drop-label'>Przenieś do katalogu</span>
						</div>

						{(rootOpen || search) &&
							(visibleTree.length > 0 || unassignedDevices.length > 0) && (
								<div className='catalog-tree-children catalog-tree-children--root'>
									{visibleTree.map((category) => (
										<CategoryTreeRow
											key={category.id}
											category={category}
											depth={1}
											devicesByCategory={devicesByCategory}
											expanded={
												search
													? new Set(flatCategories.map((item) => item.id))
													: expanded
											}
											onDrop={(item, categoryId) =>
												void moveItem(item, categoryId)
											}
											onToggle={toggleCategory}
										/>
									))}
									{unassignedDevices.length > 0 && (
										<div className='catalog-tree-unassigned'>
											<div className='catalog-tree-unassigned__label'>
												Nieprzypisane
											</div>
											{unassignedDevices.map((device) => (
												<DeviceTreeRow
													key={device.id}
													device={device}
													depth={1}
												/>
											))}
										</div>
									)}
								</div>
							)}
						{visibleTree.length === 0 && unassignedDevices.length === 0 && (
							<p className='catalog-explorer__empty'>
								Brak elementów do wyświetlenia.
							</p>
						)}
					</div>
				)}
			</section>
		</div>
	)
}
