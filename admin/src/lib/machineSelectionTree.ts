import type { CategoryTree, Device } from '@/lib/types'

export type SelectionState = 'checked' | 'indeterminate' | 'unchecked'

export function buildCategoryDeviceIds(
	tree: CategoryTree[],
	devices: Device[],
): Map<number, number[]> {
	const directIds = new Map<number, number[]>()
	for (const device of devices) {
		if (device.category_id === null) continue
		const ids = directIds.get(device.category_id) ?? []
		ids.push(device.id)
		directIds.set(device.category_id, ids)
	}

	const result = new Map<number, number[]>()
	function visit(category: CategoryTree): number[] {
		const ids = [...(directIds.get(category.id) ?? []), ...category.children.flatMap(visit)]
		result.set(category.id, ids)
		return ids
	}
	for (const category of tree) visit(category)
	return result
}

export function selectionState(targetIds: number[], selectedIds: number[]): SelectionState {
	if (targetIds.length === 0) return 'unchecked'
	const selected = new Set(selectedIds)
	const selectedCount = targetIds.filter((id) => selected.has(id)).length
	if (selectedCount === 0) return 'unchecked'
	if (selectedCount === targetIds.length) return 'checked'
	return 'indeterminate'
}

export function toggleMachineIds(selectedIds: number[], targetIds: number[]): number[] {
	if (targetIds.length === 0) return selectedIds
	const selected = new Set(selectedIds)
	const shouldRemove = targetIds.every((id) => selected.has(id))
	if (shouldRemove) {
		for (const id of targetIds) selected.delete(id)
	} else {
		for (const id of targetIds) selected.add(id)
	}
	return Array.from(selected)
}
