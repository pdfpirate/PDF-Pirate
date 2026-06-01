import type { FieldValue, FormField } from '../lib/forms'

interface Props {
  field: FormField
  value: FieldValue
  pageHeightPx: number
  onChange: (valueKey: string, value: FieldValue) => void
}

/** An always-on interactive form field rendered over the page. */
export function FormFieldOverlay({ field, value, pageHeightPx, onChange }: Props): JSX.Element {
  const style: React.CSSProperties = {
    left: `${field.left * 100}%`,
    top: `${field.top * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`
  }

  if (field.type === 'checkbox') {
    return (
      <button
        type="button"
        className={`form-field checkbox ${value ? 'checked' : ''}`}
        style={style}
        disabled={field.readOnly}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onChange(field.valueKey, !value)
        }}
        aria-label={field.name}
      >
        {value ? '✓' : ''}
      </button>
    )
  }

  const fontPx = Math.max(9, Math.min(field.height * pageHeightPx * 0.66, 28))
  const shared = {
    className: 'form-field text',
    style: { ...style, fontSize: fontPx },
    value: typeof value === 'string' ? value : '',
    readOnly: field.readOnly,
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation()
  }

  return field.multiline ? (
    <textarea {...shared} onChange={(e) => onChange(field.valueKey, e.target.value)} />
  ) : (
    <input {...shared} type="text" onChange={(e) => onChange(field.valueKey, e.target.value)} />
  )
}
