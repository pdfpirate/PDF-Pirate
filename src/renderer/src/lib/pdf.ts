import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
// Vite resolves this to an emitted asset URL; PDF.js runs parsing off the main
// thread in this worker so the UI stays responsive on large documents.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Parse PDF bytes into a PDF.js document.
 * The buffer is cloned first because PDF.js transfers (detaches) the ArrayBuffer
 * it's given — keeping the caller's original copy intact for later editing/saving.
 */
export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const bytes = data.slice()
  return pdfjsLib.getDocument({ data: bytes }).promise
}

export { pdfjsLib }
export type { PDFDocumentProxy }
