import {
	buildCategoryDeviceIds,
	selectionState,
	toggleMachineIds,
} from '@/lib/machineSelectionTree'
import type { CategoryTree, Device } from '@/lib/types'
import '@/pages/CatalogPage.css'
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, Forklift } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './MachineSelectionTree.css'

function SelectionCheckbox({
	checked,
	disabled = false,
	label,
	mixed = false,
	onChange,
}: {
	checked: boolean
	disabled?: boolean
	label: string
	mixed?: boolean
	onChange: () => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (inputRef.current) inputRef.current.indeterminate = mixed
	}, [mixed])

	return (
		<label className='machine-selection-checkbox' onClick={(event) => event.stopPropagation()}>
			<input
				ref={inputRef}
				type='checkbox'
				className='document-checkbox-input'
				aria-label={label}
				checked={checked}
				disabled={disabled}
				onChange={onChange}
			/>
			<span className='document-checkbox-box' aria-hidden='true'>
				{mixed ? (
					<span className='document-checkbox-minus' />
				) : (
					<Check size={11} strokeWidth={4} />
				)}
			</span>
		</label>
	)
}

function MachineRow({
	depth,
	device,
	onToggle,
	selected,
}: {
	depth: number
	device: Device
	onToggle: () => void
	selected: boolean
}) {
	const [imageOpen, setImageOpen] = useState(false)
	return (
		<div
			className={`catalog-tree-row catalog-tree-row--device machine-selection-row ${imageOpen ? 'catalog-tree-row--device-open' : ''} ${selected ? 'machine-selection-row--selected' : ''}`}
			data-depth={depth}
			style={{ '--tree-depth': depth } as CSSProperties}>
			<button
				type='button'
				className='catalog-tree-toggle'
				onClick={() => setImageOpen((current) => !current)}
				aria-label={imageOpen ? 'Zmniejsz podgląd maszyny' : 'Powiększ podgląd maszyny'}>
				{imageOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
			</button>
			<SelectionCheckbox
				checked={selected}
				label={`Wybierz maszynę ${device.name}`}
				onChange={onToggle}
			/>
			<div className='catalog-tree-name catalog-tree-name--device'>
				<span
					className={`catalog-tree-thumbnail ${imageOpen ? 'catalog-tree-thumbnail--open' : ''}`}>
					{device.image_url ? (
						<img src={device.image_url} alt='' />
					) : (
						<Forklift size={20} />
					)}
				</span>
				<span className='machine-selection-device-name'>{device.name}</span>
			</div>
		</div>
	)
}

interface VisibleCategory {
	category: CategoryTree
	childCount: number
	children: VisibleCategory[]
	devices: Device[]
}

function CategoryRow({
	categoryIds,
	depth,
	expanded,
	node,
	onSelectionChange,
	onToggleExpanded,
	selectedIds,
}: {
	categoryIds: Map<number, number[]>
	depth: number
	expanded: Set<number>
	node: VisibleCategory
	onSelectionChange: (ids: number[]) => void
	onToggleExpanded: (categoryId: number) => void
	selectedIds: number[]
}) {
	const { category, childCount, children, devices } = node
	const open = expanded.has(category.id)
	const targetIds = categoryIds.get(category.id) ?? []
	const state = selectionState(targetIds, selectedIds)

	return (
		<>
			<div
				className='catalog-tree-row catalog-tree-row--folder machine-selection-row'
				data-depth={depth}
				style={{ '--tree-depth': depth } as CSSProperties}>
				<button
					type='button'
					className='catalog-tree-toggle'
					onClick={() => onToggleExpanded(category.id)}
					aria-label={open ? 'Zwiń katalog' : 'Rozwiń katalog'}>
					{open ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
				</button>
				<SelectionCheckbox
					checked={state === 'checked'}
					disabled={targetIds.length === 0}
					mixed={state === 'indeterminate'}
					label={`Wybierz wszystkie maszyny w katalogu ${category.name}`}
					onChange={() => onSelectionChange(toggleMachineIds(selectedIds, targetIds))}
				/>
				<div className='catalog-tree-name catalog-tree-name--folder'>
					{open ? <FolderOpen size={22} /> : <Folder size={22} />}
					<span className='catalog-tree-label'>{category.name}</span>
					<small>{childCount}</small>
				</div>
			</div>
			{open && (children.length > 0 || devices.length > 0) && (
				<div
					className='catalog-tree-children'
					style={{ '--parent-depth': depth } as CSSProperties}>
					{children.map((child) => (
						<CategoryRow
							key={child.category.id}
							categoryIds={categoryIds}
							depth={depth + 1}
							expanded={expanded}
							node={child}
							onSelectionChange={onSelectionChange}
							onToggleExpanded={onToggleExpanded}
							selectedIds={selectedIds}
						/>
					))}
					{devices.map((device) => (
						<MachineRow
							key={device.id}
							depth={depth + 1}
							device={device}
							selected={selectedIds.includes(device.id)}
							onToggle={() =>
								onSelectionChange(toggleMachineIds(selectedIds, [device.id]))
							}
						/>
					))}
				</div>
			)}
		</>
	)
}

export function MachineSelectionTree({
	devices,
	onSelectionChange,
	search = '',
	selectedIds,
	tree,
}: {
	devices: Device[]
	onSelectionChange: (ids: number[]) => void
	search?: string
	selectedIds: number[]
	tree: CategoryTree[]
}) {
	const categoryIds = useMemo(() => buildCategoryDeviceIds(tree, devices), [devices, tree])
	const devicesByCategory = useMemo(() => {
		const result = new Map<number | null, Device[]>()
		for (const device of devices) {
			const values = result.get(device.category_id) ?? []
			values.push(device)
			result.set(device.category_id, values)
		}
		return result
	}, [devices])
	const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
	const [rootOpen, setRootOpen] = useState(true)

	useEffect(() => {
		setExpanded((current) => {
			const next = new Set(current)
			function add(categories: CategoryTree[]) {
				for (const category of categories) {
					next.add(category.id)
					add(category.children)
				}
			}
			add(tree)
			return next
		})
	}, [tree])

	const query = search.trim().toLowerCase()
	const visibleTree = useMemo(() => {
		function deviceMatches(device: Device) {
			return [device.name, device.model_serial_code]
				.filter(Boolean)
				.some((value) => value!.toLowerCase().includes(query))
		}
		function filter(
			category: CategoryTree,
			ancestorMatches = false,
		): VisibleCategory | undefined {
			const categoryMatches = ancestorMatches || category.name.toLowerCase().includes(query)
			const children = category.children
				.map((child) => filter(child, categoryMatches))
				.filter((child): child is VisibleCategory => child !== undefined)
			const directDevices = devicesByCategory.get(category.id) ?? []
			const visibleDevices = categoryMatches
				? directDevices
				: directDevices.filter(deviceMatches)
			if (!query || categoryMatches || children.length > 0 || visibleDevices.length > 0) {
				return {
					category,
					childCount: category.children.length + directDevices.length,
					children,
					devices: visibleDevices,
				}
			}
			return undefined
		}
		return tree
			.map((category) => filter(category))
			.filter((category): category is VisibleCategory => category !== undefined)
	}, [devicesByCategory, query, tree])
	const unassignedDevices = (devicesByCategory.get(null) ?? []).filter(
		(device) =>
			!query ||
			[device.name, device.model_serial_code]
				.filter(Boolean)
				.some((value) => value!.toLowerCase().includes(query)),
	)
	const allIds = devices.map((device) => device.id)
	const rootState = selectionState(allIds, selectedIds)
	const effectiveExpanded = query ? new Set(categoryIds.keys()) : expanded
	const effectiveRootOpen = rootOpen || Boolean(query)

	function toggleExpanded(categoryId: number) {
		setExpanded((current) => {
			const next = new Set(current)
			if (next.has(categoryId)) next.delete(categoryId)
			else next.add(categoryId)
			return next
		})
	}

	return (
		<div className='machine-selection'>
			<div className='catalog-tree machine-selection-tree'>
				<div
					className='catalog-tree-row catalog-tree-row--folder catalog-tree-row--root machine-selection-row'
					data-depth={0}
					style={{ '--tree-depth': 0 } as CSSProperties}>
					<button
						type='button'
						className='catalog-tree-toggle'
						onClick={() => setRootOpen((current) => !current)}
						aria-label={effectiveRootOpen ? 'Zwiń katalog' : 'Rozwiń katalog'}>
						{effectiveRootOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
					</button>
					<SelectionCheckbox
						checked={rootState === 'checked'}
						disabled={allIds.length === 0}
						mixed={rootState === 'indeterminate'}
						label='Wybierz wszystkie maszyny'
						onChange={() => onSelectionChange(toggleMachineIds(selectedIds, allIds))}
					/>
					<div className='catalog-tree-name catalog-tree-name--folder catalog-tree-name--root'>
						{effectiveRootOpen ? <FolderOpen size={23} /> : <Folder size={23} />}
						<span>Katalog maszyn</span>
						<small>{tree.length + (devicesByCategory.get(null)?.length ?? 0)}</small>
					</div>
					<button
						type='button'
						className='machine-selection-clear'
						disabled={selectedIds.length === 0}
						onClick={() => onSelectionChange([])}>
						Wyczyść
					</button>
				</div>

				{effectiveRootOpen && (visibleTree.length > 0 || unassignedDevices.length > 0) && (
					<div className='catalog-tree-children catalog-tree-children--root'>
						{visibleTree.map((category) => (
							<CategoryRow
								key={category.category.id}
								categoryIds={categoryIds}
								depth={1}
								expanded={effectiveExpanded}
								node={category}
								onSelectionChange={onSelectionChange}
								onToggleExpanded={toggleExpanded}
								selectedIds={selectedIds}
							/>
						))}
						{unassignedDevices.map((device) => (
							<MachineRow
								key={device.id}
								depth={1}
								device={device}
								selected={selectedIds.includes(device.id)}
								onToggle={() =>
									onSelectionChange(toggleMachineIds(selectedIds, [device.id]))
								}
							/>
						))}
					</div>
				)}
				{visibleTree.length === 0 && unassignedDevices.length === 0 && (
					<p className='catalog-explorer__empty'>Brak maszyn do wyświetlenia.</p>
				)}
			</div>
		</div>
	)
}
