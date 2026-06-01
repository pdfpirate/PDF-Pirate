import { type PDFDocument, type PDFPage } from 'pdf-lib'
import { dataUrlToBytes } from './placements'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Re-render a PNG visually rotated counter-clockwise by `ccw` degrees (0/90/180/270). */
async function rotatedPng(dataUrl: string, ccw: number): Promise<Uint8Array> {
  const n = ((ccw % 360) + 360) % 360
  if (n === 0) return dataUrlToBytes(dataUrl)
  const img = await loadImage(dataUrl)
  const swap = n % 180 !== 0
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d')!
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((-n * Math.PI) / 180) // canvas y-down: negative = visual counter-clockwise
  ctx.drawImage(img, -w / 2, -h / 2)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  return new Uint8Array(await blob!.arrayBuffer())
}

/** Map a display-space point (top-left origin, y-down) to PDF page coords (bottom-left, y-up). */
export function displayToPage(
  u: number,
  v: number,
  W: number,
  H: number,
  finalR: number
): { x: number; y: number } {
  switch (finalR) {
    case 90:
      return { x: v, y: u }
    case 180:
      return { x: W - u, y: v }
    case 270:
      return { x: W - v, y: H - u }
    default:
      return { x: u, y: H - v }
  }
}

/** A signature image + its page-relative rectangle (display orientation). */
export interface StampInput {
  dataUrl: string
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

/**
 * Draw one signature onto `page`, honoring the page's final rotation.
 * The signature rectangle (given in display orientation) is mapped into the page's
 * unrotated coordinate space, and the PNG is pre-rotated so it stays upright once the
 * page's rotation is applied by a viewer.
 */
export async function drawSignatureOnPage(
  doc: PDFDocument,
  page: PDFPage,
  finalR: number,
  stamp: StampInput
): Promise<void> {
  const W = page.getWidth()
  const H = page.getHeight()
  const swap = finalR % 180 !== 0
  const Dw = swap ? H : W
  const Dh = swap ? W : H

  const L = stamp.xRatio * Dw
  const T = stamp.yRatio * Dh
  const RW = stamp.wRatio * Dw
  const RH = stamp.hRatio * Dh

  const corners = [
    displayToPage(L, T, W, H, finalR),
    displayToPage(L + RW, T, W, H, finalR),
    displayToPage(L, T + RH, W, H, finalR),
    displayToPage(L + RW, T + RH, W, H, finalR)
  ]
  const x0 = Math.min(...corners.map((c) => c.x))
  const y0 = Math.min(...corners.map((c) => c.y))
  const x1 = Math.max(...corners.map((c) => c.x))
  const y1 = Math.max(...corners.map((c) => c.y))

  const img = await doc.embedPng(await rotatedPng(stamp.dataUrl, finalR))
  page.drawImage(img, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
}
