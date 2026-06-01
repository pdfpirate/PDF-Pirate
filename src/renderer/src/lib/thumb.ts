import { loadPdf } from './pdf'
import { loadImageMeta, isImageExt } from './image'

/** Render a small preview (data URL) for a PDF (first page) or image file. */
export async function renderFileThumb(
  ext: string,
  data: Uint8Array,
  targetW = 220
): Promise<string> {
  if (isImageExt(ext)) {
    return (await loadImageMeta(data, ext)).dataUrl
  }
  const doc = await loadPdf(data)
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: targetW / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (ctx) await page.render({ canvasContext: ctx, viewport }).promise
  void doc.destroy()
  return canvas.toDataURL('image/jpeg', 0.8)
}
