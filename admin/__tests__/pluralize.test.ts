import { documentCountLabel, machineCountLabel, pluralizePl, selectedLabel } from '@/lib/pluralize'
import { describe, expect, it } from 'vitest'

describe('pluralizePl', () => {
	it('uses singular for 1', () => {
		expect(pluralizePl(1, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyna')
	})

	it('uses few for 2-4', () => {
		expect(pluralizePl(2, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyny')
		expect(pluralizePl(4, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyny')
	})

	it('uses many for 5-21', () => {
		expect(pluralizePl(5, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyn')
		expect(pluralizePl(21, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyn')
	})

	it('uses many for 12-14 despite last digit', () => {
		expect(pluralizePl(12, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyn')
		expect(pluralizePl(14, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyn')
	})

	it('uses few for 22-24', () => {
		expect(pluralizePl(22, 'maszyna', 'maszyny', 'maszyn')).toBe('maszyny')
	})
})

describe('label helpers', () => {
	it('formats machine count label', () => {
		expect(machineCountLabel(1)).toBe('1 maszyna')
		expect(machineCountLabel(3)).toBe('3 maszyny')
	})

	it('formats document count label', () => {
		expect(documentCountLabel(5)).toBe('5 dokumentów')
	})

	it('formats selected label', () => {
		expect(selectedLabel(1)).toBe('Wybrano: 1 pozycja')
	})
})
