/** A signature/initials image placed on a specific page, in page-relative ratios. */
export interface Placement {
  id: string
  pageId: string // stable DocPage id
  dataUrl: string
  xRatio: number // left, 0..1 of page width
  yRatio: number // top, 0..1 of page height (screen orientation, y-down)
  wRatio: number // width, 0..1 of page width
  hRatio: number // height, 0..1 of page height
}

/** Decode a `data:image/png;base64,...` URL to raw bytes (for pdf-lib embedding). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(base64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}
