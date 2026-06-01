import { useEffect, useRef, useState } from 'react'
import type { Placement } from '../lib/placements'

interface Props {
  placement: Placement
  onChange: (id: string, partial: Partial<Placement>) => void
  onRemove: (id: string) => void
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

const isEditableTarget = (el: Element | null): boolean =>
  !!el &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    (el as HTMLElement).isContentEditable === true)

/** A movable/resizable signature overlay positioned in % of its parent page. */
export function SignaturePlacement({ placement, onChange, onRemove }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  // While hovered, Delete/Backspace removes this signature (unless typing in a field).
  useEffect(() => {
    if (!hovered) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (isEditableTarget(document.activeElement)) return
      e.preventDefault()
      onRemove(placement.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hovered, placement.id, onRemove])

  const startDrag = (e: React.MouseEvent, mode: 'move' | 'resize'): void => {
    e.preventDefault()
    e.stopPropagation()
    const parent = ref.current?.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const start = {
      x: e.clientX,
      y: e.clientY,
      px: placement.xRatio,
      py: placement.yRatio,
      pw: placement.wRatio,
      ph: placement.hRatio,
      pw_px: placement.wRatio * rect.width,
      W: rect.width,
      H: rect.height
    }

    const onMove = (ev: MouseEvent): void => {
      if (mode === 'move') {
        const dx = (ev.clientX - start.x) / start.W
        const dy = (ev.clientY - start.y) / start.H
        onChange(placement.id, {
          xRatio: clamp(start.px + dx, 0, 1 - start.pw),
          yRatio: clamp(start.py + dy, 0, 1 - start.ph)
        })
      } else {
        // Resize from the bottom-right corner, preserving aspect ratio.
        const newWpx = Math.max(24, start.pw_px + (ev.clientX - start.x))
        let factor = newWpx / start.pw_px
        const maxFactor = Math.min((1 - start.px) / start.pw, (1 - start.py) / start.ph)
        factor = Math.min(factor, maxFactor)
        onChange(placement.id, {
          wRatio: start.pw * factor,
          hRatio: start.ph * factor
        })
      }
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={ref}
      className="placement"
      style={{
        left: `${placement.xRatio * 100}%`,
        top: `${placement.yRatio * 100}%`,
        width: `${placement.wRatio * 100}%`,
        height: `${placement.hRatio * 100}%`
      }}
      onMouseDown={(e) => startDrag(e, 'move')}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img src={placement.dataUrl} alt="" draggable={false} />
      <button
        className="placement-remove"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(placement.id)
        }}
        aria-label="Remove"
      >
        ✕
      </button>
      <span
        className="placement-resize"
        onMouseDown={(e) => startDrag(e, 'resize')}
        aria-label="Resize"
      />
    </div>
  )
}
