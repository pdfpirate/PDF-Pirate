import { useEffect, useRef } from 'react'
import type { TextBox } from '../lib/textbox'

interface Props {
  box: TextBox
  editing: boolean
  selected: boolean
  scale: number
  onChange: (id: string, partial: Partial<TextBox>) => void
  onRemove: (id: string) => void
  onSelect: (id: string) => void
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/** A user text box: static text in view mode, editable + movable in edit mode. */
export function TextBoxOverlay({
  box,
  editing,
  selected,
  scale,
  onChange,
  onRemove,
  onSelect
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // Initialize the editable content once (kept uncontrolled to preserve the caret).
  useEffect(() => {
    if (editing && ref.current && ref.current.textContent !== box.text) {
      ref.current.textContent = box.text
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  // Focus a freshly added (empty) box so the user can type immediately.
  useEffect(() => {
    if (editing && selected && ref.current && !box.text) ref.current.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startMove = (e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onSelect(box.id)
    const parent = (e.currentTarget as HTMLElement).closest('.pdf-page') as HTMLElement | null
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, px: box.xRatio, py: box.yRatio, W: rect.width, H: rect.height }
    const onMove = (ev: MouseEvent): void => {
      onChange(box.id, {
        xRatio: clamp(start.px + (ev.clientX - start.x) / start.W, 0, 0.99),
        yRatio: clamp(start.py + (ev.clientY - start.y) / start.H, 0, 0.99)
      })
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const style: React.CSSProperties = {
    left: `${box.xRatio * 100}%`,
    top: `${box.yRatio * 100}%`,
    fontSize: box.fontSize * scale,
    color: box.color
  }

  if (!editing) {
    return (
      <div className="textbox static" style={style}>
        {box.text}
      </div>
    )
  }

  return (
    <div
      className={`textbox editing ${selected ? 'selected' : ''}`}
      style={style}
      onMouseDown={() => onSelect(box.id)}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="textbox-handle" onMouseDown={startMove} title="Drag to move">
        ⠿
      </span>
      <div
        ref={ref}
        className="textbox-input"
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(box.id, { text: ref.current?.textContent ?? '' })}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <button
        className="textbox-del"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(box.id)
        }}
        aria-label="Delete text box"
      >
        ✕
      </button>
    </div>
  )
}
