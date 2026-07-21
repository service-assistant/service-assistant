export type DocumentCategory = 'Instrukcja' | 'Kody błędów' | 'Schemat' | 'Biuletyn' | 'Dokument'

export function getDocumentCategory(filename: string): DocumentCategory {
	const lower = filename.toLowerCase()
	if (/(kod|error|blad|błąd|fault)/.test(lower)) return 'Kody błędów'
	if (/(schemat|diagram|wiring|schematic)/.test(lower)) return 'Schemat'
	if (/(biuletyn|bulletin|notice)/.test(lower)) return 'Biuletyn'
	if (/(instrukcj|manual|service)/.test(lower)) return 'Instrukcja'
	return 'Dokument'
}
