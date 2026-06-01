import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PdfPage } from './PdfPage'
import { ImagePageView } from './ImagePageView'
import { SignaturePlacement } from './SignaturePlacement'
import { TextBoxOverlay } from './TextBoxOverlay'
import { FormFieldOverlay } from './FormFieldOverlay'
import type { Placement } from '../lib/placements'
import type { TextBox } from '../lib/textbox'
import type { FieldValue, FormField } from '../lib/forms'
import type { DocPage, Source } from '../lib/document'

export interface PageSize {
  width: number
  height: number
}

interface PdfViewerProps {
  pages: DocPage[]
  sources: Record<string, Source>
  scale: number
  /** Base (scale-1) dimensions per page, keyed by page id. */
  pageSizes: Record<string, PageSize>
  /** A page to scroll into view (nonce makes repeat jumps to the same page fire). */
  jumpTarget?: { id: string; nonce: number } | null
  /** Request an absolute new scale (caller clamps to its min/max). */
  onScaleChange: (scale: number) => void
  /** Reports which page (1-based ordinal) is centered in the viewport. */
  onVisiblePageChange?: (page: number) => void
  placements?: Placement[]
  armed?: boolean
  armedPreview?: { dataUrl: string; aspect: number; wRatio: number }
  /** Place a signature at a page-relative point (page id, 0..1 ratios). */
  onPlace?: (pageId: string, xRatio: number, yRatio: number) => void
  onUpdatePlacement?: (id: string, partial: Partial<Placement>) => void
  onRemovePlacement?: (id: string) => void
  // --- text editing ---
  editMode?: boolean
  /** While true, the next click on a page drops a new text box (armed by the "Add text" button). */
  placingText?: boolean
  /** Style of the about-to-be-placed text box, for the cursor ghost preview. */
  textPreview?: { fontSize: number; color: string }
  textBoxes?: TextBox[]
  selectedTextId?: string | null
  onAddText?: (pageId: string, xRatio: number, yRatio: number) => void
  onUpdateTextBox?: (id: string, partial: Partial<TextBox>) => void
  onRemoveTextBox?: (id: string) => void
  onSelectText?: (id: string | null) => void
  // --- interactive form fields ---
  formFields?: FormField[]
  formValues?: Record<string, FieldValue>
  onFieldChange?: (valueKey: string, value: FieldValue) => void
}

const ZOOM_FACTOR = 1.1

/** Scrollable, continuous rendering with cursor-anchored zoom and hand-drag panning. */
export function PdfViewer({
  pages,
  sources,
  scale,
  pageSizes,
  jumpTarget,
  onScaleChange,
  onVisiblePageChange,
  placements = [],
  armed = false,
  armedPreview,
  onPlace,
  onUpdatePlacement,
  onRemovePlacement,
  editMode = false,
  placingText = false,
  textPreview,
  textBoxes = [],
  selectedTextId,
  onAddText,
  onUpdateTextBox,
  onRemoveTextBox,
  onSelectText,
  formFields = [],
  formValues = {},
  onFieldChange
}: PdfViewerProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScaleRef = useRef(scale)
  const pendingAnchor = useRef<{ ax: number; ay: number; px: number; py: number } | null>(null)
  // Cursor position over a page (page-relative), for the placement ghost.
  const [hover, setHover] = useState<{ pageId: string; cx: number; cy: number } | null>(null)

  const updateVisiblePage = useCallback(() => {
    const container = scrollRef.current
    if (!container || !onVisiblePageChange) return
    const centerY = container.scrollTop + container.clientHeight / 2
    const els = container.querySelectorAll<HTMLElement>('[data-page]')
    let current = 1
    for (const el of els) {
      if (el.offsetTop <= centerY) current = Number(el.dataset.page)
      else break
    }
    onVisiblePageChange(current)
  }, [onVisiblePageChange])

  // Ctrl/Cmd + wheel zoom (also macOS trackpad pinch), anchored at the cursor.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      pendingAnchor.current = { ax: container.scrollLeft + px, ay: container.scrollTop + py, px, py }
      const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
      onScaleChange(scale * factor)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [scale, onScaleChange])

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const oldScale = prevScaleRef.current
    if (oldScale === scale) return
    const ratio = scale / oldScale
    const anchor = pendingAnchor.current ?? {
      px: container.clientWidth / 2,
      py: container.clientHeight / 2,
      ax: container.scrollLeft + container.clientWidth / 2,
      ay: container.scrollTop + container.clientHeight / 2
    }
    container.scrollLeft = anchor.ax * ratio - anchor.px
    container.scrollTop = anchor.ay * ratio - anchor.py
    pendingAnchor.current = null
    prevScaleRef.current = scale
    updateVisiblePage()
  }, [scale, updateVisiblePage])

  // Reset to the top when the document identity (first page) changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0 })
    prevScaleRef.current = scale
    updateVisiblePage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages[0]?.id])

  // Scroll a requested page into view (from the sidebar).
  useEffect(() => {
    if (!jumpTarget) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page-id="${jumpTarget.id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [jumpTarget])

  // Click-and-drag panning (disabled while armed, so a click places a signature).
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return
    if (armed || editMode) return
    if (!(e.target as HTMLElement).closest('.pdf-pages')) return
    const container = scrollRef.current
    if (!container) return
    panning.current = {
      x: e.clientX,
      y: e.clientY,
      left: container.scrollLeft,
      top: container.scrollTop
    }
    container.classList.add('panning')
  }
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const p = panning.current
      const container = scrollRef.current
      if (!p || !container) return
      container.scrollLeft = p.left - (e.clientX - p.x)
      container.scrollTop = p.top - (e.clientY - p.y)
    }
    const onUp = (): void => {
      panning.current = null
      scrollRef.current?.classList.remove('panning')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const pointOnPage = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }
  }

  const ghostRect = (
    page: DocPage,
    cx: number,
    cy: number
  ): { left: number; top: number; w: number; h: number } | null => {
    if (!armedPreview) return null
    const size = pageSizes[page.id]
    const swap = page.rotation % 180 !== 0
    const dW = size ? (swap ? size.height : size.width) : 0
    const dH = size ? (swap ? size.width : size.height) : 0
    const w = armedPreview.wRatio
    const h = dW && dH ? (w * dW) / (armedPreview.aspect * dH) : 0.1
    return {
      left: Math.min(Math.max(cx - w / 2, 0), 1 - w),
      top: Math.min(Math.max(cy - h / 2, 0), 1 - h),
      w,
      h
    }
  }

  return (
    <div
      className={`pdf-scroll ${armed ? 'armed' : ''} ${editMode ? 'editing' : ''} ${placingText ? 'placing-text' : ''}`}
      ref={scrollRef}
      onScroll={updateVisiblePage}
      onMouseDown={onMouseDown}
    >
      <div className="pdf-pages" onMouseLeave={() => setHover(null)}>
        {pages.map((page, idx) => {
          const n = idx + 1
          const source = sources[page.sourceId]
          const size = pageSizes[page.id]
          const swap = page.rotation % 180 !== 0
          const dispW = size ? (swap ? size.height : size.width) : undefined
          const dispH = size ? (swap ? size.width : size.height) : undefined
          const pagePlacements = placements.filter((p) => p.pageId === page.id)
          const ghost =
            armed && armedPreview && hover?.pageId === page.id
              ? ghostRect(page, hover.cx, hover.cy)
              : null
          const textGhost =
            editMode && placingText && textPreview && hover?.pageId === page.id ? hover : null
          return (
            <div
              className="pdf-page"
              data-page={n}
              data-page-id={page.id}
              key={page.id}
              style={dispW && dispH ? { width: dispW * scale, height: dispH * scale } : undefined}
              onClick={(e) => {
                if (armed && onPlace) {
                  const { x, y } = pointOnPage(e)
                  onPlace(page.id, x, y)
                } else if (editMode && placingText && onAddText) {
                  // Clicks on existing text boxes stop propagation, so this is empty space.
                  const { x, y } = pointOnPage(e)
                  onAddText(page.id, x, y)
                } else if (editMode) {
                  // Clicking empty space (not placing) clears the current selection.
                  onSelectText?.(null)
                }
              }}
              onMouseMove={
                armed || (editMode && placingText)
                  ? (e) => {
                      const { x, y } = pointOnPage(e)
                      setHover({ pageId: page.id, cx: x, cy: y })
                    }
                  : undefined
              }
            >
              {source?.kind === 'pdf' && (
                <PdfPage
                  pdf={source.pdf}
                  pageNumber={page.sourcePageNumber}
                  scale={scale}
                  rotation={page.rotation}
                />
              )}
              {onFieldChange &&
                formFields
                  .filter((f) => f.pageId === page.id)
                  .map((f) => (
                    <FormFieldOverlay
                      key={f.key}
                      field={f}
                      value={formValues[f.valueKey] ?? (f.type === 'checkbox' ? false : '')}
                      pageHeightPx={(dispH ?? 0) * scale}
                      onChange={onFieldChange}
                    />
                  ))}
              {source?.kind === 'image' && size && (
                <ImagePageView
                  src={source.dataUrl}
                  width={size.width}
                  height={size.height}
                  scale={scale}
                  rotation={page.rotation}
                />
              )}
              {pagePlacements.map((p) => (
                <SignaturePlacement
                  key={p.id}
                  placement={p}
                  onChange={(id, partial) => onUpdatePlacement?.(id, partial)}
                  onRemove={(id) => onRemovePlacement?.(id)}
                />
              ))}
              {textBoxes
                .filter((t) => t.pageId === page.id)
                .map((t) => (
                  <TextBoxOverlay
                    key={t.id}
                    box={t}
                    editing={editMode}
                    selected={selectedTextId === t.id}
                    scale={scale}
                    onChange={(id, partial) => onUpdateTextBox?.(id, partial)}
                    onRemove={(id) => onRemoveTextBox?.(id)}
                    onSelect={(id) => onSelectText?.(id)}
                  />
                ))}
              {ghost && armedPreview && (
                <div
                  className="placement ghost"
                  style={{
                    left: `${ghost.left * 100}%`,
                    top: `${ghost.top * 100}%`,
                    width: `${ghost.w * 100}%`,
                    height: `${ghost.h * 100}%`
                  }}
                >
                  <img src={armedPreview.dataUrl} alt="" draggable={false} />
                </div>
              )}
              {textGhost && textPreview && (
                <div
                  className="textbox ghost"
                  style={{
                    left: `${textGhost.cx * 100}%`,
                    top: `${textGhost.cy * 100}%`,
                    fontSize: textPreview.fontSize * scale,
                    color: textPreview.color
                  }}
                >
                  Text
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
