import { useEffect, useRef } from 'react'
import { pdfjsLib, type PDFDocumentProxy } from '../lib/pdf'

interface PdfPageProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  /** Extra user rotation in degrees (added on top of the page's intrinsic rotation). */
  rotation?: number
}

/** Renders a single PDF page to a canvas at the given scale + rotation, HiDPI-crisp. */
export function PdfPage({ pdf, pageNumber, scale, rotation = 0 }: PdfPageProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    // RenderTask, typed loosely to avoid importing internal pdf.js types.
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    void (async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return

      const dpr = window.devicePixelRatio || 1
      const total = (((page.rotate ?? 0) + rotation) % 360 + 360) % 360
      const viewport = page.getViewport({ scale, rotation: total })

      // CSS size is the logical size; the backing store is multiplied by DPR for sharpness.
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)

      renderTask = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        // Don't paint form-field widgets onto the canvas — our overlay inputs own them,
        // otherwise a field's baked-in value shows through under the editable input.
        annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS
      })

      try {
        await renderTask.promise
      } catch {
        // Render was cancelled (scale change / unmount) — expected, ignore.
      }
    })()

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdf, pageNumber, scale, rotation])

  return <canvas ref={canvasRef} className="pdf-page-canvas" />
}
