import { parseOptionalId } from '@/lib/routeSearch'
import { describe, expect, it } from 'vitest'

describe('parseOptionalId', () => {
	it('accepts positive integer ids from navigation and URL search params', () => {
		expect(parseOptionalId(12)).toBe(12)
		expect(parseOptionalId('12')).toBe(12)
	})

	it('rejects missing and invalid ids', () => {
		expect(parseOptionalId(undefined)).toBeUndefined()
		expect(parseOptionalId('')).toBeUndefined()
		expect(parseOptionalId('12x')).toBeUndefined()
		expect(parseOptionalId(0)).toBeUndefined()
		expect(parseOptionalId(-1)).toBeUndefined()
	})
})
