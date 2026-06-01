import { PDFDocument } from 'pdf-lib'

export type SourceKind = 'pdf' | 'image'

/** One source in the combine list — a whole PDF or a single image. */
export interface CombineItem {
  id: string
  name: string
  ext: string
  kind: SourceKind
  data: Uint8Array
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg']

export function kindForExt(ext: string): SourceKind | null {
  const e = ext.toLowerCase()
  if (e === 'pdf') return 'pdf'
  if (IMAGE_EXTS.includes(e)) return 'image'
  return null
}

/**
 * Merge the given items, in order, into a single PDF.
 * - PDFs contribute all their pages.
 * - Images each become one page sized to the image (no distortion).
 * Returns the saved PDF bytes.
 */
export async function combineToPdf(items: CombineItem[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()

  for (const item of items) {
    if (item.kind === 'pdf') {
      const src = await PDFDocument.load(item.data, { ignoreEncryption: true })
      const pages = await out.copyPages(src, src.getPageIndices())
      pages.forEach((p) => out.addPage(p))
    } else {
      const ext = item.ext.toLowerCase()
      const img =
        ext === 'png' ? await out.embedPng(item.data) : await out.embedJpg(item.data)
      const page = out.addPage([img.width, img.height])
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
    }
  }

  return out.save()
}
