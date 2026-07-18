import type { PdfDocumentProxy } from './pdfTypes';

export async function loadPdfDocument(fileUrl: string): Promise<PdfDocumentProxy> {
	const [pdfjs, response] = await Promise.all([
		import('pdfjs-dist/build/pdf.mjs'),
		fetch(fileUrl),
	]);

	if (!response.ok) {
		throw new Error(`PDF request failed: ${response.status}`);
	}

	pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
	const buffer = await response.arrayBuffer();
	return (await pdfjs.getDocument({ data: buffer }).promise) as PdfDocumentProxy;
}
