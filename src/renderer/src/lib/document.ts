import type { PDFDocumentProxy } from './pdf'

/** A loaded PDF a page can come from. */
export interface PdfSource {
  kind: 'pdf'
  pdf: PDFDocumentProxy
  bytes: Uint8Array
}

/** A loaded image; contributes a single page. */
export interface ImageSource {
  kind: 'image'
  ext: string // 'png' | 'jpg' | 'jpeg'
  bytes: Uint8Array
  dataUrl: string
  width: number
  height: number
}

export type Source = PdfSource | ImageSource

/** One page in the working document — a stable identity pointing at a source page. */
export interface DocPage {
  id: string
  sourceId: string
  sourcePageNumber: number // 1-based within its source (1 for images)
  rotation: number // user rotation in degrees (0/90/180/270)
}

let pageSeq = 0
let sourceSeq = 0
export const nextPageId = (): string => `pg-${++pageSeq}`
export const nextSourceId = (): string => `src-${++sourceSeq}`
