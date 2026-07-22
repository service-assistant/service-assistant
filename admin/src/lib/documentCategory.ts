export type DocumentCategory = 'Instrukcja' | 'Kody błędów' | 'Schemat' | 'Biuletyn' | 'Dokument'

export function getDocumentCategory(filename: string): DocumentCategory {
	const lower = filename.toLowerCase()
	if (/(kod|error|blad|błąd|fault)/.test(lower)) return 'Kody błędów'
	if (/(schemat|diagram|wiring|schematic)/.test(lower)) return 'Schemat'
	if (/(biuletyn|bulletin|notice)/.test(lower)) return 'Biuletyn'
	if (/(instrukcj|manual|service)/.test(lower)) return 'Instrukcja'
	return 'Dokument'
}

export const DOCUMENT_CATEGORY_BADGE_CLASSES: Record<DocumentCategory, string> = {
	'Kody błędów': 'border border-violet-400/40 bg-violet-400/10 text-violet-300',
	Instrukcja: 'border border-sky-400/40 bg-sky-400/10 text-sky-300',
	Schemat: 'border border-teal-400/40 bg-teal-400/10 text-teal-300',
	Biuletyn: 'border border-amber-400/40 bg-amber-400/10 text-amber-300',
	Dokument: 'border border-cream/20 bg-cream/5 text-cream/60',
}

export const DOCUMENT_CATEGORY_ICON_CLASSES: Record<DocumentCategory, string> = {
	'Kody błędów': 'border border-violet-400/30 bg-ink text-violet-300',
	Instrukcja: 'border border-sky-400/30 bg-ink text-sky-300',
	Schemat: 'border border-teal-400/30 bg-ink text-teal-300',
	Biuletyn: 'border border-amber-400/30 bg-ink text-amber-300',
	Dokument: 'border border-cream/15 bg-ink text-cream/50',
}
