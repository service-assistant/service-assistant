export type PdfDocumentProxy = {
	destroy?: () => Promise<void> | void;
	getPage: (pageNumber: number) => Promise<PdfPageProxy>;
	numPages: number;
};

export type PdfPageProxy = {
	getViewport: (options: { scale: number }) => { height: number; width: number };
	render: (options: {
		canvasContext: CanvasRenderingContext2D;
		viewport: { height: number; width: number };
	}) => {
		cancel: () => void;
		promise: Promise<void>;
	};
};
