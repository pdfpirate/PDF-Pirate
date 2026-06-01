import { useEffect, useState } from 'react'
import type { DocPage, Source } from '../lib/document'

const THUMB_WIDTH = 130

/** Small preview of a page (PDF page rendered, or the image), rotation-aware for PDFs. */
export function PageThumb({ page, source }: { page: DocPage; source?: Source }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!source) {
      setUrl(null)
      return
    }
    if (source.kind === 'image') {
      setUrl(source.dataUrl)
      return
    }
    void (async () => {
      try {
        const p = await source.pdf.getPage(page.sourcePageNumber)
        const total = (((p.rotate ?? 0) + page.rotation) % 360 + 360) % 360
        const base = p.getViewport({ scale: 1, rotation: total })
        const viewport = p.getViewport({ scale: THUMB_WIDTH / base.width, rotation: total })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')
        if (ctx) {
          await p.render({ canvasContext: ctx, viewport }).promise
          if (active) setUrl(canvas.toDataURL())
        }
      } catch {
        // ignore — leave placeholder
      }
    })()
    return () => {
      active = false
    }
  }, [page.sourcePageNumber, page.rotation, source])

  const rotateStyle =
    source?.kind === 'image' && page.rotation
      ? { transform: `rotate(${page.rotation}deg)` }
      : undefined

  if (!url) return <div className="thumb-loading" />
  return <img className="page-thumb-img" src={url} alt="" draggable={false} style={rotateStyle} />
}
