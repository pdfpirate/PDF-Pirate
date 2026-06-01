import { useEffect, useRef, useState } from 'react'
import { typeLabel, type SignatureType } from '../lib/signatures'

interface EditTarget {
  id: string
  name: string
  dataUrl: string
}

interface SignaturePadProps {
  type: SignatureType
  /** When present, the pad edits an existing item (rename and/or redraw/retype). */
  edit?: EditTarget
  onClose: () => void
  onSaved: () => void
}

type PadTab = 'draw' | 'type'

const FONTS = [
  { family: 'Dancing Script', label: 'Dancing' },
  { family: 'Great Vibes', label: 'Vibes' },
  { family: 'Sacramento', label: 'Sacramento' },
  { family: 'Caveat', label: 'Caveat' }
]

/** Crop transparent margins so the saved PNG hugs the content. Returns null if blank. */
function trimToInk(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = src.getContext('2d')
  if (!ctx) return null
  const { width, height } = src
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  let found = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!found) return null
  const pad = 10
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')?.drawImage(src, minX, minY, w, h, 0, 0, w, h)
  return out
}

/** Render typed text in the chosen font to a transparent canvas. */
async function renderTypedCanvas(text: string, family: string): Promise<HTMLCanvasElement> {
  const fontSize = 100
  const font = `${fontSize}px '${family}'`
  await document.fonts.load(font, text)

  const dpr = 2
  const measureCanvas = document.createElement('canvas')
  const mctx = measureCanvas.getContext('2d')!
  mctx.font = font
  const textW = Math.ceil(mctx.measureText(text).width)

  const padX = 40
  const logicalW = textW + padX * 2
  const logicalH = Math.round(fontSize * 2)

  const canvas = document.createElement('canvas')
  canvas.width = logicalW * dpr
  canvas.height = logicalH * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.font = font
  ctx.fillStyle = '#15171a'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(text, padX, logicalH / 2)
  return canvas
}

async function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

export function SignaturePad({ type, edit, onClose, onSaved }: SignaturePadProps): JSX.Element {
  const [tab, setTab] = useState<PadTab>('draw')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [name, setName] = useState(edit?.name ?? '')
  const [typeText, setTypeText] = useState('')
  const [font, setFont] = useState(FONTS[0].family)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = typeLabel(type)

  // Size the canvas backing store for crisp, HiDPI strokes (draw tab is visible on mount).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * dpr)
    canvas.height = Math.round(canvas.clientHeight * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#15171a'
    ctxRef.current = ctx
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pointAt = (e: React.PointerEvent): { x: number; y: number } => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    const ctx = ctxRef.current
    if (!ctx) return
    const { x, y } = pointAt(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drawing.current) return
    const ctx = ctxRef.current
    if (!ctx) return
    const { x, y } = pointAt(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  const onPointerUp = (): void => {
    drawing.current = false
  }

  const clear = (): void => {
    if (tab === 'type') {
      setTypeText('')
      return
    }
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const handleSave = async (): Promise<void> => {
    setError(null)
    let bytes: Uint8Array | null = null

    if (tab === 'type') {
      const text = typeText.trim()
      if (!text) {
        setError(`Type your ${label} first.`)
        return
      }
      const rendered = await renderTypedCanvas(text, font)
      bytes = await canvasToBytes(trimToInk(rendered) ?? rendered)
      if (!bytes) {
        setError('Could not render the text.')
        return
      }
    } else if (hasInk) {
      const cropped = trimToInk(canvasRef.current!)
      if (!cropped) {
        setError(`Please draw your ${label} first.`)
        return
      }
      bytes = await canvasToBytes(cropped)
      if (!bytes) {
        setError('Could not export the drawing.')
        return
      }
    } else if (!edit) {
      setError(`Please draw or type your ${label} first.`)
      return
    }

    setSaving(true)
    try {
      if (edit) await window.api.updateSignature(edit.id, name, bytes)
      else await window.api.saveSignature(type, name, bytes as Uint8Array)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {edit ? 'Edit' : 'New'} {label}
        </h2>

        <label className="field">
          <span>Name (optional)</span>
          <input
            type="text"
            value={name}
            placeholder={label === 'initials' ? 'e.g. Work initials' : 'e.g. Full signature'}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="pad-tabs">
          <button className={`pad-tab ${tab === 'draw' ? 'active' : ''}`} onClick={() => setTab('draw')}>
            ✍ Draw
          </button>
          <button className={`pad-tab ${tab === 'type' ? 'active' : ''}`} onClick={() => setTab('type')}>
            ⌨ Type
          </button>
        </div>

        {/* Draw surface stays mounted (kept sized) and is just hidden on the Type tab. */}
        <div className="pad-wrap" style={{ display: tab === 'draw' ? 'block' : 'none' }}>
          {edit && edit.dataUrl && !hasInk && (
            <img className="pad-guide" src={edit.dataUrl} alt="" aria-hidden />
          )}
          <canvas
            ref={canvasRef}
            className="pad-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {!hasInk && !(edit && edit.dataUrl) && <span className="pad-hint">Draw here</span>}
        </div>

        {tab === 'type' && (
          <div className="type-area">
            <input
              className="type-input"
              type="text"
              value={typeText}
              placeholder={`Type your ${label}`}
              onChange={(e) => setTypeText(e.target.value)}
              autoFocus
            />
            <div className="type-preview" style={{ fontFamily: `'${font}'` }}>
              {typeText || (
                <span className="type-preview-placeholder">Preview appears here</span>
              )}
            </div>
            <div className="font-choices">
              {FONTS.map((f) => (
                <button
                  key={f.family}
                  className={`font-choice ${font === f.family ? 'active' : ''}`}
                  style={{ fontFamily: `'${f.family}'` }}
                  onClick={() => setFont(f.family)}
                >
                  {typeText || f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {edit && (
          <p className="pad-note">Draw/type to replace the image, or just change the name and save.</p>
        )}
        {error && <div className="banner error inline">{error}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={clear} disabled={saving}>
            Clear
          </button>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
