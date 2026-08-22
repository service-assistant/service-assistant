import { fileSelectionError, mergeUploadFiles } from '@/lib/documentUpload'
import { describe, expect, it } from 'vitest'

function file(name: string, size: number, type: string) {
	return { name, size, type }
}

describe('fileSelectionError', () => {
	it('accepts PDFs identified by MIME type or extension', () => {
		expect(fileSelectionError([file('manual', 1024, 'application/pdf')])).toBeNull()
		expect(fileSelectionError([file('MANUAL.PDF', 1024, '')])).toBeNull()
	})

	it('rejects a selection containing a non-PDF file', () => {
		expect(
			fileSelectionError([
				file('manual.pdf', 1024, ''),
				file('photo.png', 1024, 'image/png'),
			]),
		).toBe('Wszystkie pliki muszą być w formacie PDF.')
	})

	it('rejects a PDF larger than 200 MB', () => {
		expect(
			fileSelectionError([file('manual.pdf', 200 * 1024 * 1024 + 1, 'application/pdf')]),
		).toBe('Każdy plik może mieć maksymalnie 200 MB.')
	})
})

describe('mergeUploadFiles', () => {
	it('appends files from another drop instead of replacing the current selection', () => {
		const first = new File(['first'], 'first.pdf', {
			type: 'application/pdf',
			lastModified: 1,
		})
		const second = new File(['second'], 'second.pdf', {
			type: 'application/pdf',
			lastModified: 2,
		})

		expect(mergeUploadFiles([first], [second])).toEqual([first, second])
	})

	it('does not add the exact same file twice', () => {
		const original = new File(['manual'], 'manual.pdf', {
			type: 'application/pdf',
			lastModified: 10,
		})
		const duplicate = new File(['manual'], 'manual.pdf', {
			type: 'application/pdf',
			lastModified: 10,
		})

		expect(mergeUploadFiles([original], [duplicate])).toEqual([original])
	})
})
