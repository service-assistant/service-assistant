import { categoryPath, descendantIds, flattenCategoryTree } from '@/lib/categoryTree'
import type { CategoryTree } from '@/lib/types'
import { describe, expect, it } from 'vitest'

function node(
	id: number,
	name: string,
	parent_id: number | null,
	children: CategoryTree[] = [],
): CategoryTree {
	return {
		id,
		name,
		image_url: null,
		parent_id,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		children,
	}
}

const tree: CategoryTree[] = [
	node(1, 'Toyota', null, [
		node(2, 'Reach Truck', 1, [node(3, 'RRE Series', 2)]),
		node(4, 'Counterbalance', 1),
	]),
	node(5, 'Linde', null),
]

describe('flattenCategoryTree', () => {
	it('walks depth-first with correct depth per node', () => {
		const flat = flattenCategoryTree(tree)
		expect(flat.map((c) => [c.id, c.depth])).toEqual([
			[1, 0],
			[2, 1],
			[3, 2],
			[4, 1],
			[5, 0],
		])
	})

	it('returns empty array for empty tree', () => {
		expect(flattenCategoryTree([])).toEqual([])
	})
})

describe('categoryPath', () => {
	const flat = flattenCategoryTree(tree)

	it('returns dash for null category', () => {
		expect(categoryPath(null, flat)).toBe('—')
	})

	it('returns single name for a root category', () => {
		expect(categoryPath(1, flat)).toBe('Toyota')
	})

	it('joins ancestor chain with a slash for nested categories', () => {
		expect(categoryPath(3, flat)).toBe('Toyota / Reach Truck / RRE Series')
	})

	it('returns dash for an id not present in the flat list', () => {
		expect(categoryPath(999, flat)).toBe('—')
	})
})

describe('descendantIds', () => {
	it('collects all nested descendants, not just direct children', () => {
		const flat = flattenCategoryTree(tree)
		expect(descendantIds(1, flat)).toEqual(new Set([2, 3, 4]))
	})

	it('returns empty set for a leaf category', () => {
		const flat = flattenCategoryTree(tree)
		expect(descendantIds(3, flat)).toEqual(new Set())
	})
})
