export type FieldValue = string | boolean

/** An interactive form field (AcroForm widget) positioned in page-relative ratios. */
export interface FormField {
  key: string // unique per widget (for React)
  valueKey: string // shared per field name within a source
  sourceId: string
  pageId: string
  name: string
  type: 'text' | 'checkbox'
  left: number
  top: number
  width: number
  height: number
  multiline: boolean
  readOnly: boolean
}

/**
 * Convert a page's PDF.js annotations into our FormField list + initial values.
 * v1 handles text fields and checkboxes (the common LOA/contract cases).
 */
export function readFields(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  annotations: any[],
  sourceId: string,
  pageId: string,
  pageW: number,
  pageH: number
): { fields: FormField[]; values: Record<string, FieldValue> } {
  const fields: FormField[] = []
  const values: Record<string, FieldValue> = {}

  annotations.forEach((a, i) => {
    if (a.subtype !== 'Widget' || !a.fieldType) return
    let type: 'text' | 'checkbox' | null = null
    if (a.fieldType === 'Tx' && !a.pushButton) type = 'text'
    else if (a.fieldType === 'Btn' && a.checkBox) type = 'checkbox'
    if (!type) return

    const name: string = a.fieldName ?? ''
    if (!name) return

    const r = a.rect as number[]
    const x1 = Math.min(r[0], r[2])
    const x2 = Math.max(r[0], r[2])
    const y1 = Math.min(r[1], r[3])
    const y2 = Math.max(r[1], r[3])

    const valueKey = `${sourceId}::${name}`
    fields.push({
      key: `${sourceId}::${name}::${pageId}::${i}`,
      valueKey,
      sourceId,
      pageId,
      name,
      type,
      left: x1 / pageW,
      top: (pageH - y2) / pageH,
      width: (x2 - x1) / pageW,
      height: (y2 - y1) / pageH,
      multiline: !!a.multiLine,
      readOnly: !!a.readOnly
    })

    if (!(valueKey in values)) {
      values[valueKey] =
        type === 'checkbox'
          ? !!a.fieldValue && a.fieldValue !== 'Off'
          : typeof a.fieldValue === 'string'
            ? a.fieldValue
            : ''
    }
  })

  return { fields, values }
}
