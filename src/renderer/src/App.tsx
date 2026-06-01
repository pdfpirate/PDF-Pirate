import { useCallback, useEffect, useState } from 'react'
import { loadPdf } from './lib/pdf'
import { PdfViewer, type PageSize } from './components/PdfViewer'
import { PageSidebar } from './components/PageSidebar'
import { CombinePanel } from './components/CombinePanel'
import { SignPopover } from './components/SignPopover'
import { QuickAccess } from './components/QuickAccess'
import { Recents } from './components/Recents'
import { assembleDocument } from './lib/assemble'
import { renderFileThumb } from './lib/thumb'
import { loadImageMeta, isImageExt } from './lib/image'
import type { Placement } from './lib/placements'
import type { SavedSignature } from './lib/signatures'
import { nextTextId, type TextBox } from './lib/textbox'
import { readFields, type FieldValue, type FormField } from './lib/forms'
import { nextPageId, nextSourceId, type DocPage, type Source } from './lib/document'
import logo from './assets/logo.png'

type Mode = 'view' | 'combine'
interface InputFile {
  name: string
  ext: string
  data: Uint8Array
  path?: string // present when opened from disk — used to record a Recent
}

const MIN_SCALE = 0.4
const MAX_SCALE = 3
const SCALE_STEP = 0.2
const DEFAULT_SIG_WIDTH = 0.28
const MIN_SIG_WIDTH = 0.05
const MAX_SIG_WIDTH = 0.9
const SIG_RESIZE_STEP = 1.08 // per wheel notch while Alt/Option-scrolling

// Platform-aware label for the resize modifier (Option on Mac, Alt on Windows).
const ALT_KEY_LABEL =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌥' : 'Alt'

const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +s.toFixed(3)))
const clamp01 = (v: number, size: number): number => Math.min(Math.max(v, 0), 1 - size)

let placementCounter = 0
const nextPlacementId = (): string => `pl-${++placementCounter}`
let jumpSeq = 0

function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('view')

  const [pages, setPages] = useState<DocPage[]>([])
  const [sources, setSources] = useState<Record<string, Source>>({})
  const [pageSizes, setPageSizes] = useState<Record<string, PageSize>>({})
  const [fileName, setFileName] = useState<string>('')

  const [scale, setScale] = useState(1.1)
  const [currentPage, setCurrentPage] = useState(1)
  const [jumpTarget, setJumpTarget] = useState<{ id: string; nonce: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const [showSignPopover, setShowSignPopover] = useState(false)
  const [armed, setArmed] = useState<{ sig: SavedSignature; aspect: number } | null>(null)
  const [armedWidth, setArmedWidth] = useState(DEFAULT_SIG_WIDTH)
  const [placingPos, setPlacingPos] = useState<{ x: number; y: number } | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])

  // Text editing
  const [editMode, setEditMode] = useState(false)
  const [placingText, setPlacingText] = useState(false)
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [textStyle, setTextStyle] = useState({ fontSize: 16, color: '#111111' })

  // Interactive form fields
  const [formFields, setFormFields] = useState<FormField[]>([])
  const [formValues, setFormValues] = useState<Record<string, FieldValue>>({})

  const hasDoc = pages.length > 0
  const hasRotations = pages.some((p) => p.rotation % 360 !== 0)

  // Add PDFs and/or images to the working document (replace = start a fresh document).
  const addFiles = useCallback(async (files: InputFile[], replace: boolean) => {
    const supported = files.filter((f) => f.ext.toLowerCase() === 'pdf' || isImageExt(f.ext))
    if (!supported.length) {
      if (files.length) setError('Unsupported file type. Use PDF, PNG, or JPG.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const newSources: Record<string, Source> = {}
      const newPages: DocPage[] = []
      const newSizes: Record<string, PageSize> = {}
      const newFields: FormField[] = []
      const newValues: Record<string, FieldValue> = {}

      for (const f of supported) {
        const ext = f.ext.toLowerCase()
        if (ext === 'pdf') {
          const doc = await loadPdf(f.data)
          const sid = nextSourceId()
          newSources[sid] = { kind: 'pdf', pdf: doc, bytes: f.data }
          for (let i = 1; i <= doc.numPages; i++) {
            const pid = nextPageId()
            newPages.push({ id: pid, sourceId: sid, sourcePageNumber: i, rotation: 0 })
            const pdfPage = await doc.getPage(i)
            const vp = pdfPage.getViewport({ scale: 1 })
            newSizes[pid] = { width: vp.width, height: vp.height }
            try {
              const annots = await pdfPage.getAnnotations()
              const { fields, values } = readFields(annots, sid, pid, vp.width, vp.height)
              newFields.push(...fields)
              Object.assign(newValues, values)
            } catch {
              // no annotations / not a form page
            }
          }
        } else {
          const meta = await loadImageMeta(f.data, ext)
          const sid = nextSourceId()
          newSources[sid] = {
            kind: 'image',
            ext,
            bytes: f.data,
            dataUrl: meta.dataUrl,
            width: meta.width,
            height: meta.height
          }
          const pid = nextPageId()
          newPages.push({ id: pid, sourceId: sid, sourcePageNumber: 1, rotation: 0 })
          newSizes[pid] = { width: meta.width, height: meta.height }
        }
      }

      if (replace) {
        setSources(newSources)
        setPages(newPages)
        setPageSizes(newSizes)
        setFormFields(newFields)
        setFormValues(newValues)
        setPlacements([])
        setNotice(null)
        setCurrentPage(1)
        setFileName(supported[0].name)
      } else {
        setSources((prev) => ({ ...prev, ...newSources }))
        setPages((prev) => [...prev, ...newPages])
        setPageSizes((prev) => ({ ...prev, ...newSizes }))
        setFormFields((prev) => [...prev, ...newFields])
        setFormValues((prev) => ({ ...prev, ...newValues }))
        setFileName((prev) => prev || supported[0].name)
        // Jump the viewer to the first page of what was just added.
        if (newPages.length) setJumpTarget({ id: newPages[0].id, nonce: ++jumpSeq })
      }

      // Record opened-from-disk files into Recents (fire & forget — never blocks the open).
      if (window.api?.addRecent) {
        void Promise.all(
          supported
            .filter((f) => f.path)
            .map(async (f) => {
              let thumb = ''
              try {
                thumb = await renderFileThumb(f.ext.toLowerCase(), f.data)
              } catch {
                // leave a blank thumb if preview fails
              }
              try {
                await window.api.addRecent(f.name, f.path as string, thumb)
              } catch {
                // ignore — Recents is best-effort
              }
            })
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add files.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Open = start a fresh document from one or more selected PDFs/images.
  const handleOpenDialog = useCallback(async () => {
    try {
      if (!window.api?.pickFiles) {
        setError('File dialog isn’t available yet — fully restart the dev server (Ctrl+C, then npm run dev).')
        return
      }
      const picked = await window.api.pickFiles()
      if (picked.length) {
        await addFiles(
          picked.map((p) => ({ name: p.name, ext: p.ext, data: p.data, path: p.path })),
          true
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open the file dialog.')
    }
  }, [addFiles])

  const handleClear = useCallback(() => {
    setPages([])
    setSources({})
    setPageSizes({})
    setPlacements([])
    setTextBoxes([])
    setEditMode(false)
    setSelectedTextId(null)
    setFormFields([])
    setFormValues({})
    setFileName('')
    setArmed(null)
    setShowSignPopover(false)
    setNotice(null)
    setError(null)
    setCurrentPage(1)
  }, [])

  const handleAddFiles = useCallback(async () => {
    try {
      if (!window.api?.pickFiles) {
        setError('File picker unavailable — fully restart the dev server (Ctrl+C, then npm run dev).')
        return
      }
      const picked = await window.api.pickFiles()
      if (picked.length) {
        await addFiles(
          picked.map((p) => ({ name: p.name, ext: p.ext, data: p.data, path: p.path })),
          false
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add files.')
    }
  }, [addFiles])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (mode !== 'view') return
      const files = Array.from(e.dataTransfer.files)
      if (!files.length) return
      const read = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          ext: f.name.split('.').pop()?.toLowerCase() ?? '',
          data: new Uint8Array(await f.arrayBuffer()),
          // Electron augments dropped File objects with their absolute path.
          path: (f as File & { path?: string }).path || undefined
        }))
      )
      await addFiles(read, !hasDoc)
    },
    [addFiles, mode, hasDoc]
  )

  const handleScaleChange = useCallback((s: number) => setScale(clampScale(s)), [])

  useEffect(() => {
    if (mode !== 'view') {
      setArmed(null)
      setShowSignPopover(false)
      setEditMode(false)
      setPlacingText(false)
      setSelectedTextId(null)
    }
  }, [mode])

  // While placing (a signature or a new text box), track the cursor so the hint follows it.
  useEffect(() => {
    if (!armed && !placingText) {
      setPlacingPos(null)
      return
    }
    const onMove = (e: MouseEvent): void => setPlacingPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [armed, placingText])

  // While arming a signature/initials, Alt/Option + scroll grows or shrinks the placement.
  useEffect(() => {
    if (!armed) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.altKey) return // plain scroll still scrolls the page; Ctrl/Cmd still zooms
      e.preventDefault()
      const factor = e.deltaY < 0 ? SIG_RESIZE_STEP : 1 / SIG_RESIZE_STEP
      setArmedWidth((w) => Math.min(MAX_SIG_WIDTH, Math.max(MIN_SIG_WIDTH, w * factor)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [armed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setArmed(null)
        setPlacingText(false)
        setSelectedTextId(null)
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'o') {
        e.preventDefault()
        void handleOpenDialog()
      } else if (key === '=' || key === '+') {
        e.preventDefault()
        setScale((s) => clampScale(s * 1.1))
      } else if (key === '-') {
        e.preventDefault()
        setScale((s) => clampScale(s / 1.1))
      } else if (key === '0') {
        e.preventDefault()
        setScale(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleOpenDialog])

  const zoomOut = (): void => setScale((s) => clampScale(s - SCALE_STEP))
  const zoomIn = (): void => setScale((s) => clampScale(s + SCALE_STEP))

  const rotatePage = useCallback(
    (delta: number) => {
      setPages((prev) =>
        prev.map((pg, i) =>
          i === currentPage - 1
            ? { ...pg, rotation: (((pg.rotation + delta) % 360) + 360) % 360 }
            : pg
        )
      )
    },
    [currentPage]
  )

  const reorderPages = useCallback((dragId: string, targetId: string) => {
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === dragId)
      const to = prev.findIndex((p) => p.id === targetId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const deletePage = useCallback((pageId: string) => {
    setPages((prev) => prev.filter((p) => p.id !== pageId))
    setPlacements((prev) => prev.filter((pl) => pl.pageId !== pageId))
    setTextBoxes((prev) => prev.filter((t) => t.pageId !== pageId))
    setFormFields((prev) => prev.filter((f) => f.pageId !== pageId))
  }, [])

  const onFieldChange = useCallback((valueKey: string, value: FieldValue) => {
    setFormValues((prev) => ({ ...prev, [valueKey]: value }))
  }, [])

  // ----- Text boxes -----
  const toggleEdit = useCallback(() => {
    setEditMode((v) => {
      const next = !v
      if (next) {
        setArmed(null)
        setShowSignPopover(false)
      } else {
        setPlacingText(false)
        setSelectedTextId(null)
      }
      return next
    })
  }, [])

  const addText = useCallback(
    (pageId: string, x: number, y: number) => {
      const id = nextTextId()
      setTextBoxes((prev) => [
        ...prev,
        {
          id,
          pageId,
          xRatio: Math.min(Math.max(x, 0), 0.95),
          yRatio: Math.min(Math.max(y, 0), 0.97),
          fontSize: textStyle.fontSize,
          color: textStyle.color,
          text: ''
        }
      ])
      setSelectedTextId(id)
      setPlacingText(false)
    },
    [textStyle]
  )

  const updateTextBox = useCallback((id: string, partial: Partial<TextBox>) => {
    setTextBoxes((prev) => prev.map((t) => (t.id === id ? { ...t, ...partial } : t)))
  }, [])

  const removeTextBox = useCallback((id: string) => {
    setTextBoxes((prev) => prev.filter((t) => t.id !== id))
    setSelectedTextId((cur) => (cur === id ? null : cur))
  }, [])

  const applyTextStyle = useCallback(
    (partial: Partial<{ fontSize: number; color: string }>) => {
      setTextStyle((s) => ({ ...s, ...partial }))
      if (selectedTextId) updateTextBox(selectedTextId, partial)
    },
    [selectedTextId, updateTextBox]
  )

  const selectedBox = textBoxes.find((t) => t.id === selectedTextId)

  const jumpToPage = useCallback((pageId: string) => {
    setJumpTarget({ id: pageId, nonce: ++jumpSeq })
  }, [])

  const handlePick = useCallback((sig: SavedSignature) => {
    setShowSignPopover(false)
    setArmedWidth(DEFAULT_SIG_WIDTH) // start each placement at the default size
    const img = new Image()
    img.onload = () =>
      setArmed({ sig, aspect: img.naturalHeight ? img.naturalWidth / img.naturalHeight : 3 })
    img.src = sig.dataUrl
  }, [])

  const handlePlace = useCallback(
    (pageId: string, cx: number, cy: number) => {
      if (!armed) return
      const page = pages.find((p) => p.id === pageId)
      const size = pageSizes[pageId]
      const swap = (page?.rotation ?? 0) % 180 !== 0
      const dW = size ? (swap ? size.height : size.width) : 0
      const dH = size ? (swap ? size.width : size.height) : 0
      const wRatio = armedWidth
      const hRatio = dW && dH ? (wRatio * dW) / (armed.aspect * dH) : 0.1
      setPlacements((prev) => [
        ...prev,
        {
          id: nextPlacementId(),
          pageId,
          dataUrl: armed.sig.dataUrl,
          xRatio: clamp01(cx - wRatio / 2, wRatio),
          yRatio: clamp01(cy - hRatio / 2, hRatio),
          wRatio,
          hRatio
        }
      ])
      setArmed(null)
    },
    [armed, armedWidth, pages, pageSizes]
  )

  const updatePlacement = useCallback((id: string, partial: Partial<Placement>) => {
    setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, ...partial } : p)))
  }, [])

  const removePlacement = useCallback((id: string) => {
    setPlacements((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleSave = useCallback(async () => {
    if (!pages.length) return
    setError(null)
    try {
      const bytes = await assembleDocument(pages, sources, placements, textBoxes, formValues)
      const suffix = placements.length > 0 ? '-signed' : '-edited'
      const defaultName = `${fileName.replace(/\.pdf$/i, '') || 'document'}${suffix}.pdf`
      const path = await window.api.savePdf(bytes, defaultName)
      if (path) setNotice(`✓ Saved to ${path}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the PDF.')
    }
  }, [pages, sources, placements, textBoxes, formValues, fileName])

  return (
    <div
      className="app"
      onDragOver={(e) => {
        e.preventDefault()
        // Only react to OS file drags — not internal sidebar page-reordering.
        if (mode === 'view' && Array.from(e.dataTransfer.types).includes('Files')) {
          setDragging(true)
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <header className="topbar">
        <span className="brand">🏴‍☠️ PDF Pirate</span>
        {/* Tabs only matter on the home screen; once a doc is open everything is in the view. */}
        {!hasDoc && (
          <nav className="tabs">
            <button
              className={`tab ${mode === 'view' ? 'active' : ''}`}
              onClick={() => setMode('view')}
            >
              Home
            </button>
            <button
              className={`tab ${mode === 'combine' ? 'active' : ''}`}
              onClick={() => setMode('combine')}
            >
              Combine
            </button>
          </nav>
        )}

        {mode === 'view' && (
          <>
            {hasDoc && (
              <button className="btn primary" onClick={handleOpenDialog}>
                Open
              </button>
            )}
            {hasDoc && (
              <button className="btn ghost" onClick={handleAddFiles}>
                + Add files
              </button>
            )}
            {hasDoc && (
              <button className="btn ghost" onClick={handleClear}>
                Clear
              </button>
            )}
            {fileName && <span className="filename">{fileName}</span>}
            {hasDoc && (
              <div className="toolbar-right">
                <div className="rotate">
                  <button
                    className="btn icon rotate-btn"
                    onClick={() => rotatePage(-90)}
                    aria-label="Rotate page left"
                    title="Rotate current page 90° left"
                  >
                    ↺
                  </button>
                  <button
                    className="btn icon rotate-btn"
                    onClick={() => rotatePage(90)}
                    aria-label="Rotate page right"
                    title="Rotate current page 90° right"
                  >
                    ↻
                  </button>
                </div>
                <button
                  className={`btn icon-text ${editMode ? 'active' : ''}`}
                  onClick={toggleEdit}
                >
                  {editMode ? '✓ Done' : '✎ Edit'}
                </button>
                {editMode && (
                  <div className="edit-tools">
                    <button
                      className={`btn icon-text add-text-btn ${placingText ? 'active' : ''}`}
                      onClick={() => setPlacingText((v) => !v)}
                      title="Add a text box — then click where you want it on the page"
                      aria-pressed={placingText}
                    >
                      Add text
                    </button>
                    <input
                      className="num-input"
                      type="number"
                      min={8}
                      max={96}
                      value={selectedBox ? selectedBox.fontSize : textStyle.fontSize}
                      onChange={(e) => applyTextStyle({ fontSize: Number(e.target.value) || 16 })}
                      title="Font size"
                    />
                    <input
                      className="color-input"
                      type="color"
                      value={selectedBox ? selectedBox.color : textStyle.color}
                      onChange={(e) => applyTextStyle({ color: e.target.value })}
                      title="Text color"
                    />
                  </div>
                )}
                {!editMode && (
                  <button
                    className={`btn icon-text ${showSignPopover ? 'active' : ''}`}
                    onClick={() => setShowSignPopover((v) => !v)}
                  >
                    ✍ Sign
                  </button>
                )}
                <button className="btn primary" onClick={handleSave}>
                  Save
                </button>
                <div className="zoom">
                  <button
                    className="btn icon"
                    onClick={zoomOut}
                    aria-label="Zoom out"
                    disabled={scale <= MIN_SCALE}
                  >
                    −
                  </button>
                  <span className="zoom-level">{Math.round(scale * 100)}%</span>
                  <button
                    className="btn icon"
                    onClick={zoomIn}
                    aria-label="Zoom in"
                    disabled={scale >= MAX_SCALE}
                  >
                    +
                  </button>
                </div>
                <span className="page-indicator">
                  Page {currentPage} / {pages.length}
                </span>
              </div>
            )}
          </>
        )}
      </header>

      <main className="stage">
        {mode === 'combine' ? (
          <CombinePanel />
        ) : (
          <>
            {error && <div className="banner error">{error}</div>}
            {notice && (
              <div className="banner success" onClick={() => setNotice(null)}>
                {notice}
              </div>
            )}
            {loading && <div className="placeholder">Working…</div>}

            {!hasDoc && !loading && (
              <div className="home">
                <div className={`dropzone ${dragging ? 'active' : ''}`}>
                  <div className="dropzone-inner">
                    <img className="dropzone-icon" src={logo} alt="PDF Pirate" />
                    <h1>Open files to get started</h1>
                    <p>
                      Drag &amp; drop / open one or more PDFs or images. Once opened, you may reorganize, combine, delete,
                      sign, and edit pages from the view screen.
                    </p>
                    <button className="btn primary large" onClick={handleOpenDialog}>
                      Open files
                    </button>
                    <p className="hint">PDF · PNG · JPG · select multiple · ⌘O / Ctrl+O</p>
                  </div>
                </div>
                <div className="wave-divider" aria-hidden="true">
                  <svg viewBox="0 0 1200 80" preserveAspectRatio="none">
                    {/* back swell */}
                    <path
                      className="wave-back"
                      d="M0,40 C200,18 380,60 600,40 C820,20 1000,60 1200,40 L1200,80 L0,80 Z"
                    />
                    {/* front swell */}
                    <path
                      className="wave-front"
                      d="M0,50 C160,30 320,68 600,50 C880,32 1040,70 1200,50 L1200,80 L0,80 Z"
                    />
                    {/* white crest line, echoing the logo's water */}
                    <path
                      className="wave-crest"
                      fill="none"
                      d="M0,50 C160,30 320,68 600,50 C880,32 1040,70 1200,50"
                    />
                  </svg>
                </div>
                <div className="home-panels">
                  <QuickAccess onOpen={(file) => addFiles([file], true)} />
                  <Recents onOpen={(file) => addFiles([file], true)} />
                </div>
              </div>
            )}

            {hasDoc && !loading && (
              <div className="editor">
                <PageSidebar
                  pages={pages}
                  sources={sources}
                  currentPage={currentPage}
                  onReorder={reorderPages}
                  onDelete={deletePage}
                  onJump={jumpToPage}
                  onAdd={handleAddFiles}
                />
                <div className="editor-main">
                  <PdfViewer
                    pages={pages}
                    sources={sources}
                    scale={scale}
                    pageSizes={pageSizes}
                    jumpTarget={jumpTarget}
                    onScaleChange={handleScaleChange}
                    onVisiblePageChange={setCurrentPage}
                    placements={placements}
                    armed={!!armed}
                    armedPreview={
                      armed
                        ? { dataUrl: armed.sig.dataUrl, aspect: armed.aspect, wRatio: armedWidth }
                        : undefined
                    }
                    onPlace={handlePlace}
                    onUpdatePlacement={updatePlacement}
                    onRemovePlacement={removePlacement}
                    editMode={editMode}
                    placingText={placingText}
                    textPreview={{ fontSize: textStyle.fontSize, color: textStyle.color }}
                    textBoxes={textBoxes}
                    selectedTextId={selectedTextId}
                    onAddText={addText}
                    onUpdateTextBox={updateTextBox}
                    onRemoveTextBox={removeTextBox}
                    onSelectText={setSelectedTextId}
                    formFields={formFields}
                    formValues={formValues}
                    onFieldChange={onFieldChange}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {mode === 'view' && hasDoc && showSignPopover && (
        <SignPopover onPick={handlePick} onClose={() => setShowSignPopover(false)} />
      )}

      {mode === 'view' && (armed || placingText) && placingPos && (
        <div
          className="placing-tip"
          style={{
            left: Math.min(placingPos.x + 16, window.innerWidth - (armed ? 340 : 196)),
            top: Math.min(placingPos.y + 18, window.innerHeight - 40)
          }}
        >
          {placingText ? (
            <>
              Click to add text · <kbd>Esc</kbd> to cancel
            </>
          ) : (
            <>
              Click to place · <kbd>{ALT_KEY_LABEL}</kbd> + scroll to resize · <kbd>Esc</kbd> to
              cancel
            </>
          )}
        </div>
      )}

      {mode === 'view' && dragging && <div className="drag-overlay">Drop files to add</div>}
    </div>
  )
}

export default App
