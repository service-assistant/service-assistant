import type { CategoryTree } from '@/lib/types'

export interface FlatCategory {
	id: number
	name: string
	parent_id: number | null
	depth: number
}

export function flattenCategoryTree(tree: CategoryTree[]): FlatCategory[] {
	const flat: FlatCategory[] = []

	function walk(nodes: CategoryTree[], depth: number) {
		for (const node of nodes) {
			flat.push({ id: node.id, name: node.name, parent_id: node.parent_id, depth })
			walk(node.children, depth + 1)
		}
	}

	walk(tree, 0)
	return flat
}

export function categoryPath(
	categoryId: number | null,
	flat: Pick<FlatCategory, 'id' | 'name' | 'parent_id'>[],
): string {
	if (categoryId === null) return '—'

	const byId = new Map(flat.map((c) => [c.id, c]))
	const names: string[] = []
	let currentId: number | null = categoryId
	const seen = new Set<number>()

	while (currentId !== null) {
		if (seen.has(currentId)) break
		seen.add(currentId)
		const current = byId.get(currentId)
		if (!current) break
		names.unshift(current.name)
		currentId = current.parent_id
	}

	return names.length > 0 ? names.join(' / ') : '—'
}

export function descendantIds(categoryId: number, flat: FlatCategory[]): Set<number> {
	const childrenByParent = new Map<number, number[]>()
	for (const c of flat) {
		if (c.parent_id === null) continue
		const siblings = childrenByParent.get(c.parent_id) ?? []
		siblings.push(c.id)
		childrenByParent.set(c.parent_id, siblings)
	}

	const result = new Set<number>()
	const stack = [...(childrenByParent.get(categoryId) ?? [])]
	while (stack.length > 0) {
		const id = stack.pop()!
		if (result.has(id)) continue
		result.add(id)
		stack.push(...(childrenByParent.get(id) ?? []))
	}
	return result
}
