import { getDocumentCategory } from '@/lib/documentCategory'
import { describe, expect, it } from 'vitest'

describe('getDocumentCategory', () => {
	it('detects error code documents', () => {
		expect(getDocumentCategory('error_codes.pdf')).toBe('Kody błędów')
		expect(getDocumentCategory('kody-bledow.pdf')).toBe('Kody błędów')
	})

	it('detects wiring schematics', () => {
		expect(getDocumentCategory('wiring-diagram.pdf')).toBe('Schemat')
	})

	it('detects service bulletins', () => {
		expect(getDocumentCategory('service-bulletin.pdf')).toBe('Biuletyn')
	})

	it('detects manuals', () => {
		expect(getDocumentCategory('service-manual.pdf')).toBe('Instrukcja')
	})

	it('falls back to generic document', () => {
		expect(getDocumentCategory('random-file.pdf')).toBe('Dokument')
	})
})
