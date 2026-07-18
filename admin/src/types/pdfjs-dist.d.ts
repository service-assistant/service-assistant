declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(options: { data: ArrayBuffer }): {
    promise: Promise<{
      destroy?: () => Promise<void> | void;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (options: { scale: number }) => { height: number; width: number };
        render: (options: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { height: number; width: number };
        }) => {
          cancel: () => void;
          promise: Promise<void>;
        };
      }>;
      numPages: number;
    }>;
  };
}
