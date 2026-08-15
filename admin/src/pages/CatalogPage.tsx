import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useCategoryChildren, useCategoryTree, useRootCategories } from '@/hooks/useCategories'
import { useDeviceAttachments, useDevices } from '@/hooks/useDevices'
import { categoryPath, flattenCategoryTree } from '@/lib/categoryTree'
import type { Category, Device } from '@/lib/types'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Layers, Plus, Search, ShieldAlert, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'

type Tab = 'models' | 'categories'

function TabButton({
	label,
	active,
	onClick,
}: {
	label: string
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			onClick={onClick}
			className={`rounded-md px-4 py-2 text-sm ${active ? 'bg-ember text-ink' : 'text-cream/60 hover:bg-panel-soft'}`}>
			{label}
		</button>
	)
}

function ModelRow({ device, categoryLabel }: { device: Device; categoryLabel: string }) {
	const { data: attachments } = useDeviceAttachments(device.id)
	const assigned = (attachments?.length ?? 0) > 0

	return (
		<Link
			to='/machines/$deviceId'
			params={{ deviceId: String(device.id) }}
			className='grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3 text-sm text-cream/80 last:border-b-0 hover:bg-panel-soft'>
			<span className='flex items-center gap-3 text-cream'>
				{device.image_url ? (
					<img
						src={device.image_url}
						alt=''
						className='size-9 shrink-0 rounded-md object-cover'
					/>
				) : (
					<span className='flex size-9 shrink-0 items-center justify-center rounded-md bg-panel-soft text-cream/30'>
						<Wrench size={16} />
					</span>
				)}
				<span>
					<div>{device.name}</div>
					{device.model_serial_code && (
						<div className='text-xs text-cream/40'>{device.model_serial_code}</div>
					)}
				</span>
			</span>
			<span>{categoryLabel}</span>
			<span className='text-xs text-cream/60'>
				{attachments === undefined
					? '…'
					: attachments.length === 0
						? '0 dokumentów'
						: `${attachments.length} dokumentów`}
			</span>
			<span className='flex items-center gap-1.5 text-xs'>
				<span
					className={`inline-block size-1.5 rounded-full ${assigned ? 'bg-emerald-400' : 'bg-rose-400'}`}
				/>
				<span className={assigned ? 'text-emerald-300' : 'text-rose-300'}>
					{assigned ? 'Przypisana' : 'Nieprzypisana'}
				</span>
			</span>
		</Link>
	)
}

function ModelsTab() {
	const { data: devices, isLoading } = useDevices()
	const { data: tree } = useCategoryTree()
	const [search, setSearch] = useState('')

	const flat = flattenCategoryTree(tree ?? [])

	const filtered = useMemo(
		() => devices?.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())) ?? [],
		[devices, search],
	)

	return (
		<div>
			<div className='mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
				<Search size={16} className='text-cream/40' />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Szukaj po nazwie modelu…'
					className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
				/>
			</div>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Model</span>
					<span>Kategoria</span>
					<span>Dokumenty</span>
					<span>Status</span>
				</div>
				{isLoading && <div className='px-4 py-6 text-sm text-cream/50'>Ładowanie…</div>}
				{filtered.map((device) => (
					<ModelRow
						key={device.id}
						device={device}
						categoryLabel={categoryPath(device.category_id, flat)}
					/>
				))}
			</div>
		</div>
	)
}

function CategoryRow({
	category,
	devices,
	depth,
}: {
	category: Category
	devices: Device[] | undefined
	depth: number
}) {
	const [expanded, setExpanded] = useState(false)
	const { data: children, isLoading } = useCategoryChildren(category.id, expanded)
	const deviceCount = devices?.filter((d) => d.category_id === category.id).length ?? 0

	return (
		<>
			<div
				className='grid grid-cols-[2fr_1fr] items-center gap-4 border-b border-line py-3 pr-4 text-sm text-cream/80 hover:bg-panel-soft'
				style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
				<span className='flex items-center gap-2'>
					<button
						onClick={() => setExpanded((v) => !v)}
						aria-label={expanded ? 'Zwiń' : 'Rozwiń'}
						className='flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-cream/40 hover:bg-panel-soft hover:text-cream'>
						{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
					</button>
					<Link
						to='/categories/$categoryId'
						params={{ categoryId: String(category.id) }}
						className='text-cream hover:underline'>
						{category.name}
					</Link>
				</span>
				<span>{deviceCount}</span>
			</div>
			{expanded && isLoading && (
				<div
					className='border-b border-line py-2 text-xs text-cream/40'
					style={{ paddingLeft: `${2.5 + depth * 1.5}rem` }}>
					Ładowanie…
				</div>
			)}
			{expanded && !isLoading && children?.length === 0 && (
				<div
					className='border-b border-line py-2 text-xs text-cream/40'
					style={{ paddingLeft: `${2.5 + depth * 1.5}rem` }}>
					Brak podkategorii.
				</div>
			)}
			{expanded &&
				children?.map((child) => (
					<CategoryRow
						key={child.id}
						category={child}
						devices={devices}
						depth={depth + 1}
					/>
				))}
		</>
	)
}

function CategoriesTab() {
	const { data: rootCategories, isLoading } = useRootCategories()
	const { data: devices } = useDevices()
	const [search, setSearch] = useState('')

	const filtered = useMemo(
		() =>
			rootCategories?.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())) ??
			[],
		[rootCategories, search],
	)

	return (
		<div>
			<div className='mb-4 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2'>
				<Search size={16} className='text-cream/40' />
				<input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder='Szukaj kategorii głównej…'
					className='w-full bg-transparent text-sm text-cream outline-none placeholder:text-cream/40'
				/>
			</div>
			<div className='rounded-lg border border-line bg-panel'>
				<div className='grid grid-cols-[2fr_1fr] gap-4 border-b border-line px-4 py-2 text-xs uppercase tracking-wide text-cream/40'>
					<span>Kategoria</span>
					<span>Liczba modeli</span>
				</div>
				{isLoading && <div className='px-4 py-6 text-sm text-cream/50'>Ładowanie…</div>}
				{!isLoading && filtered.length === 0 && (
					<div className='px-4 py-6 text-sm text-cream/50'>Brak kategorii.</div>
				)}
				{filtered.map((category) => (
					<CategoryRow
						key={category.id}
						category={category}
						devices={devices}
						depth={0}
					/>
				))}
			</div>
		</div>
	)
}

export function CatalogPage() {
	const { tab } = useSearch({ strict: false }) as { tab?: Tab }
	const navigate = useNavigate()
	const activeTab: Tab = tab ?? 'models'
	const { data: devices } = useDevices()
	const { data: tree } = useCategoryTree()
	const categoryCount = flattenCategoryTree(tree ?? []).length

	function setTab(t: Tab) {
		void navigate({ to: '/catalog', search: { tab: t } })
	}

	return (
		<div>
			<PageHeader
				title='Katalog maszyn'
				subtitle='Zarządzaj kategoriami i modelami maszyn używanymi w dokumentach oraz asystencie.'
				meta={
					<>
						{categoryCount} kategorii · {devices?.length ?? 0} modeli
					</>
				}
			/>

			<div className='mb-6 grid grid-cols-3 gap-4'>
				<StatTile
					label='Kategorie'
					value={categoryCount}
					sublabel='aktywnych'
					icon={Layers}
					color='blue'
				/>
				<StatTile
					label='Modele'
					value={devices?.length ?? 0}
					sublabel='w katalogu'
					icon={Wrench}
					color='green'
				/>
				<StatTile
					label='Nieprzypisane'
					value={0}
					sublabel='wymagają uwagi'
					icon={ShieldAlert}
					color='red'
				/>
			</div>

			<div className='mb-6 flex items-center justify-between'>
				<h2 className='text-xl font-bold text-cream'>
					{activeTab === 'models' ? 'Modele maszyn' : 'Kategorie'}
				</h2>
				<div className='flex gap-2'>
					{activeTab === 'models' && (
						<Link
							to='/add-machine'
							className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
							<Plus size={16} />
							Dodaj maszynę
						</Link>
					)}
					{activeTab === 'categories' && (
						<Link
							to='/categories/new'
							className='flex items-center gap-2 rounded-md bg-ember px-4 py-2 text-sm font-semibold text-ink'>
							<Plus size={16} />
							Dodaj kategorię
						</Link>
					)}
				</div>
			</div>

			<div className='mb-4 flex gap-2 rounded-md border border-line bg-panel p-1'>
				<TabButton
					label='Modele maszyn'
					active={activeTab === 'models'}
					onClick={() => setTab('models')}
				/>
				<TabButton
					label='Kategorie'
					active={activeTab === 'categories'}
					onClick={() => setTab('categories')}
				/>
			</div>

			{activeTab === 'models' && <ModelsTab />}
			{activeTab === 'categories' && <CategoriesTab />}
		</div>
	)
}
