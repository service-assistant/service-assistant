import type { PdfDocumentProxy } from './pdfTypes';

export async function loadPdfDocument(_fileUrl: string): Promise<PdfDocumentProxy> {
	throw new Error('Podgląd PDF jest dostępny wyłącznie w wersji web.');
}
