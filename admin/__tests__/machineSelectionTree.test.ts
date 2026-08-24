import {
	buildCategoryDeviceIds,
	selectionState,
	toggleMachineIds,
} from '@/lib/machineSelectionTree'
import type { CategoryTree, Device } from '@/lib/types'
import { describe, expect, it } from 'vitest'

function category(
	id: number,
	name: string,
	parentId: number | null,
	children: CategoryTree[] = [],
): CategoryTree {
	return {
		id,
		name,
		parent_id: parentId,
		image_url: null,
		created_at: '',
		updated_at: '',
		children,
	}
}

function device(id: number, categoryId: number | null): Device {
	return {
		id,
		name: `Maszyna ${id}`,
		category_id: categoryId,
		image_url: null,
		model_serial_code: null,
		created_at: '',
		updated_at: '',
	}
}

const tree = [category(1, 'Toyota', null, [category(2, 'Seria A', 1)])]
const devices = [device(10, 1), device(11, 2), device(12, null)]

describe('machine selection tree', () => {
	it('collects concrete machine ids from the whole category subtree', () => {
		const ids = buildCategoryDeviceIds(tree, devices)
		expect(ids.get(1)).toEqual([10, 11])
		expect(ids.get(2)).toEqual([11])
	})

	it('derives checked, indeterminate and unchecked folder states', () => {
		expect(selectionState([10, 11], [])).toBe('unchecked')
		expect(selectionState([10, 11], [10])).toBe('indeterminate')
		expect(selectionState([10, 11], [10, 11])).toBe('checked')
	})

	it('selects all current machines in a folder and removes them on the next toggle', () => {
		expect(toggleMachineIds([12], [10, 11])).toEqual([12, 10, 11])
		expect(toggleMachineIds([12, 10, 11], [10, 11])).toEqual([12])
	})

	it('does not turn a folder selection into a dynamic rule', () => {
		const selected = toggleMachineIds([], buildCategoryDeviceIds(tree, devices).get(1) ?? [])
		const devicesAfterAddition = [...devices, device(13, 2)]
		expect(selected).toEqual([10, 11])
		expect(buildCategoryDeviceIds(tree, devicesAfterAddition).get(1)).toEqual([10, 11, 13])
		expect(selected).not.toContain(13)
	})
})
