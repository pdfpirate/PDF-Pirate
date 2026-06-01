import { useEffect, useState } from 'react'
import { loadPdf } from '../lib/pdf'
import type { CombineItem } from '../lib/combine'

const THUMB_WIDTH = 160

const imageMime = (ext: string): string => (ext.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg')

/**
 * Renders a preview for a combine item:
 * - images → the image itself (via an object URL)
 * - PDFs   → the first page rendered to a small canvas
 * Computed once per item (cards are keyed by id, so reordering won't re-render).
 */
interface CombineThumbProps {
  item: CombineItem
  /** Reports the source's page count (1 for images) once known. */
  onPageCount?: (pages: number) => void
}

export function CombineThumb({ item, onPageCount }: CombineThumbProps): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined

    void (async () => {
      try {
        if (item.kind === 'image') {
          if (active) onPageCount?.(1)
          // Copy into a standalone ArrayBuffer so the Blob typing is unambiguous.
          const buffer = item.data.buffer.slice(
            item.data.byteOffset,
            item.data.byteOffset + item.data.byteLength
          ) as ArrayBuffer
          objectUrl = URL.createObjectURL(new Blob([buffer], { type: imageMime(item.ext) }))
          if (active) setUrl(objectUrl)
        } else {
          const doc = await loadPdf(item.data)
          if (active) onPageCount?.(doc.numPages)
          const page = await doc.getPage(1)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const ctx = canvas.getContext('2d')
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise
            if (active) setUrl(canvas.toDataURL())
          }
          void doc.destroy()
        }
      } catch {
        // Leave the placeholder showing if preview generation fails.
      }
    })()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item])

  if (!url) return <div className="thumb-loading" />
  return <img className="thumb-img" src={url} alt={item.name} draggable={false} />
}
