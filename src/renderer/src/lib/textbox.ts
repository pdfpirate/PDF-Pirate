/** A user-added text box, positioned in page-relative ratios (top-left). */
export interface TextBox {
  id: string
  pageId: string
  xRatio: number
  yRatio: number
  fontSize: number // PDF points (display px = fontSize * scale)
  color: string // hex
  text: string
}

let seq = 0
export const nextTextId = (): string => `tx-${++seq}`
