import { useCallback, useState } from 'react'
import { combineToPdf, kindForExt, type CombineItem } from '../lib/combine'
import { CombineThumb } from './CombineThumb'

let idCounter = 0
const nextId = (): string => `item-${++idCounter}`

type Status =
  | { kind: 'idle' }
  | { kind: 'combining' }
  | { kind: 'saved'; path: string }
  | { kind: 'error'; message: string }

/** Build CombineItems from picked/dropped files, skipping unsupported types. */
function toItems(files: { name: string; ext: string; data: Uint8Array }[]): {
  items: CombineItem[]
  skipped: string[]
} {
  const items: CombineItem[] = []
  const skipped: string[] = []
  for (const f of files) {
    const kind = kindForExt(f.ext)
    if (!kind) {
      skipped.push(f.name)
      continue
    }
    items.push({ id: nextId(), name: f.name, ext: f.ext, kind, data: f.data })
  }
  return { items, skipped }
}

const extOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? ''
const hasFiles = (dt: DataTransfer): boolean => Array.from(dt.types).includes('Files')

export function CombinePanel(): JSX.Element {
  const [items, setItems] = useState<CombineItem[]>([])
  const [pageCounts, setPageCounts] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [dragOver, setDragOver] = useState(false) // external file drag (adding)
  const [draggingId, setDraggingId] = useState<string | null>(null) // internal reorder

  const handlePageCount = useCallback((id: string, n: number) => {
    setPageCounts((prev) => (prev[id] === n ? prev : { ...prev, [id]: n }))
  }, [])

  const addFiles = useCallback((added: { name: string; ext: string; data: Uint8Array }[]) => {
    const { items: newItems, skipped } = toItems(added)
    if (newItems.length) setItems((prev) => [...prev, ...newItems])
    if (skipped.length) {
      setStatus({ kind: 'error', message: `Skipped unsupported file(s): ${skipped.join(', ')}` })
    } else if (newItems.length) {
      setStatus({ kind: 'idle' })
    }
  }, [])

  const handleAddClick = useCallback(async () => {
    try {
      if (!window.api?.pickFiles) {
        setStatus({
          kind: 'error',
          message: 'File picker unavailable — fully restart the dev server (Ctrl+C, then npm run dev).'
        })
        return
      }
      addFiles(await window.api.pickFiles())
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Could not add files.' })
    }
  }, [addFiles])

  // Drop files onto the panel to add them (ignored for internal card reordering).
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      if (!hasFiles(e.dataTransfer)) return
      const read = await Promise.all(
        Array.from(e.dataTransfer.files).map(async (f) => ({
          name: f.name,
          ext: extOf(f.name),
          data: new Uint8Array(await f.arrayBuffer())
        }))
      )
      addFiles(read)
    },
    [addFiles]
  )

  const remove = (id: string): void => setItems((prev) => prev.filter((i) => i.id !== id))
  const clearAll = (): void => {
    setItems([])
    setPageCounts({})
    setStatus({ kind: 'idle' })
  }

  // ----- Drag-to-reorder (live: items shift as you drag a tile over them) -----
  const onCardDragStart = (e: React.DragEvent, id: string): void => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onCardDragEnter = (targetId: string): void => {
    if (!draggingId || draggingId === targetId) return
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === draggingId)
      const to = prev.findIndex((i) => i.id === targetId)
      if (from < 0 || to < 0 || from === to) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }
  const onCardDragEnd = (): void => setDraggingId(null)

  const handleCombine = useCallback(async () => {
    if (!items.length) return
    setStatus({ kind: 'combining' })
    try {
      const bytes = await combineToPdf(items)
      const path = await window.api.savePdf(bytes, 'combined.pdf')
      if (path) setStatus({ kind: 'saved', path })
      else setStatus({ kind: 'idle' }) // user cancelled the save dialog
    } catch (e) {
      setStatus({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Something went wrong while combining.'
      })
    }
  }, [items])

  return (
    <div
      className={`combine ${dragOver ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (hasFiles(e.dataTransfer)) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="combine-head">
        <div>
          <h2>Combine files</h2>
          <p>Merge PDFs and images into one PDF. Drag to add, drag tiles to reorder, then export.</p>
        </div>
        <div className="combine-head-actions">
          <button className="btn primary" onClick={handleAddClick}>
            Add files
          </button>
          {items.length > 0 && (
            <button className="btn ghost" onClick={clearAll}>
              Clear
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="combine-empty">
          <div className="dropzone-icon">🗂️</div>
          <p>No files yet — drag PDFs or images here, or click “Add files.”</p>
          <p className="hint">Supported: PDF, PNG, JPG</p>
        </div>
      ) : (
        <div className="combine-grid">
          {items.map((item, i) => {
            const pages = pageCounts[item.id] ?? 1
            return (
              <figure
                key={item.id}
                className={`thumb-card ${draggingId === item.id ? 'dragging-card' : ''}`}
                draggable
                onDragStart={(e) => onCardDragStart(e, item.id)}
                onDragEnter={() => onCardDragEnter(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={onCardDragEnd}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <div className="thumb-num">{i + 1}</div>
                <div className={`thumb-stack ${pages > 1 ? 'multi' : ''} ${pages > 2 ? 'deep' : ''}`}>
                  <div className="thumb-frame">
                    <CombineThumb item={item} onPageCount={(n) => handlePageCount(item.id, n)} />
                    <button
                      className="thumb-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(item.id)
                      }}
                      aria-label={`Remove ${item.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <figcaption className="thumb-name" title={item.name}>
                  {item.name}
                </figcaption>
                {pages > 1 && <span className="thumb-pages">{pages} pages</span>}
              </figure>
            )
          })}
        </div>
      )}

      <div className="combine-footer">
        <div className="combine-status">
          {status.kind === 'combining' && <span>Combining…</span>}
          {status.kind === 'saved' && <span className="ok">✓ Saved to {status.path}</span>}
          {status.kind === 'error' && <span className="err">{status.message}</span>}
        </div>
        <button
          className="btn primary large"
          onClick={handleCombine}
          disabled={items.length === 0 || status.kind === 'combining'}
        >
          {status.kind === 'combining'
            ? 'Combining…'
            : `Combine & Save${items.length ? ` (${items.length})` : ''}`}
        </button>
      </div>
    </div>
  )
}
