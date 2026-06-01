import {
  PDFDocument,
  PDFCheckBox,
  PDFName,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage
} from 'pdf-lib'
import { drawSignatureOnPage, displayToPage } from './sign'
import type { DocPage, Source, PdfSource } from './document'
import type { Placement } from './placements'
import type { TextBox } from './textbox'
import type { FieldValue } from './forms'

function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return rgb(isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b)
}

function drawTextBox(page: PDFPage, font: PDFFont, tb: TextBox, finalR: number): void {
  const W = page.getWidth()
  const H = page.getHeight()
  const size = tb.fontSize
  const lineHeight = size * 1.18
  const color = hexToRgb(tb.color)
  const lines = tb.text.split('\n')

  if (finalR % 360 === 0) {
    const x = tb.xRatio * W
    const yTop = tb.yRatio * H
    lines.forEach((line, i) => {
      page.drawText(line, { x, y: H - yTop - size - i * lineHeight, size, font, color })
    })
  } else {
    const swap = finalR % 180 !== 0
    const Dw = swap ? H : W
    const Dh = swap ? W : H
    const anchor = displayToPage(tb.xRatio * Dw, tb.yRatio * Dh + size, W, H, finalR)
    page.drawText(tb.text, {
      x: anchor.x,
      y: anchor.y,
      size,
      font,
      color,
      lineHeight,
      rotate: degrees(finalR)
    })
  }
}

/** Set form field values on a loaded doc. Matches by bare field name within the source. */
function fillForm(doc: PDFDocument, sourceId: string, formValues: Record<string, FieldValue>): void {
  let form
  try {
    form = doc.getForm()
  } catch {
    return // no form
  }
  const fields = form.getFields()
  if (!fields.length) return
  const prefix = `${sourceId}::`
  const wanted: Record<string, FieldValue> = {}
  for (const [k, v] of Object.entries(formValues)) {
    if (k.startsWith(prefix)) wanted[k.slice(prefix.length)] = v
  }
  for (const field of fields) {
    const name = field.getName()
    if (!(name in wanted)) continue
    const val = wanted[name]
    try {
      if (field instanceof PDFCheckBox) {
        if (val) field.check()
        else field.uncheck()
      } else if (field instanceof PDFTextField) {
        field.setText(typeof val === 'string' ? val : '')
      }
    } catch {
      // skip a field that won't accept the value
    }
  }
}

/** Permanently bake form values into the page content (best for sending to others). */
function flattenForm(doc: PDFDocument, font: PDFFont): void {
  let form
  try {
    form = doc.getForm()
  } catch {
    return // no form
  }
  if (!form.getFields().length) return
  try {
    // Drop any dynamic (XFA) layer so viewers rely on the flattened content.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acro: any = (form as unknown as { acroForm?: any }).acroForm
    acro?.dict?.delete?.(PDFName.of('XFA'))
  } catch {
    // ignore
  }
  try {
    form.updateFieldAppearances(font) // force a present font before flattening
  } catch {
    // ignore appearance errors
  }
  try {
    form.flatten({ updateFieldAppearances: false })
  } catch {
    // can't flatten cleanly — values stay set, just editable
  }
}

function groupByPage<T extends { pageId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const arr = map.get(item.pageId) ?? []
    arr.push(item)
    map.set(item.pageId, arr)
  }
  return map
}

/**
 * Fast path for the common case: the document is exactly one PDF source, all its
 * pages, in original order. We edit that document in place — the form (with values)
 * is preserved intact, plus rotation/signatures/text. No page copying, no flatten.
 */
async function assembleSingleSource(
  source: PdfSource,
  pages: DocPage[],
  placements: Placement[],
  textBoxes: TextBox[],
  formValues: Record<string, FieldValue>
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(source.bytes, { ignoreEncryption: true })
  const helvetica = await doc.embedFont(StandardFonts.Helvetica)
  // Fill the form, leaving it editable (the standard form-filling behavior).
  fillForm(doc, pages[0].sourceId, formValues)

  const placementsByPage = groupByPage(placements)
  const textsByPage = groupByPage(textBoxes)
  const docPages = doc.getPages()

  for (const page of pages) {
    const outPage = docPages[page.sourcePageNumber - 1]
    if (!outPage) continue
    const finalR = (((outPage.getRotation().angle + page.rotation) % 360) + 360) % 360
    if (page.rotation % 360 !== 0) outPage.setRotation(degrees(finalR))
    for (const pl of placementsByPage.get(page.id) ?? []) {
      await drawSignatureOnPage(doc, outPage, finalR, pl)
    }
    for (const tb of textsByPage.get(page.id) ?? []) {
      if (tb.text.trim()) drawTextBox(outPage, helvetica, tb, finalR)
    }
  }
  return doc.save()
}

/** True when `pages` is exactly one PDF source's pages, in original order. */
function isPristineSingleSource(pages: DocPage[], sources: Record<string, Source>): boolean {
  if (!pages.length) return false
  const sourceId = pages[0].sourceId
  const src = sources[sourceId]
  if (!src || src.kind !== 'pdf') return false
  if (pages.length !== src.pdf.numPages) return false
  return pages.every((p, i) => p.sourceId === sourceId && p.sourcePageNumber === i + 1)
}

/** Load a source PDF, fill + flatten its form (for the multi-source copy path). */
async function prepareSource(
  sourceId: string,
  bytes: Uint8Array,
  formValues: Record<string, FieldValue>
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  fillForm(doc, sourceId, formValues)
  // Page-copying can't carry a live form, so always bake values in on this path.
  const font = await doc.embedFont(StandardFonts.Helvetica)
  flattenForm(doc, font)
  return doc
}

/**
 * Assemble the working document into one PDF, applying per-page rotation and
 * burning in signatures, text boxes, and form values.
 */
export async function assembleDocument(
  pages: DocPage[],
  sources: Record<string, Source>,
  placements: Placement[],
  textBoxes: TextBox[] = [],
  formValues: Record<string, FieldValue> = {}
): Promise<Uint8Array> {
  if (isPristineSingleSource(pages, sources)) {
    return assembleSingleSource(
      sources[pages[0].sourceId] as PdfSource,
      pages,
      placements,
      textBoxes,
      formValues
    )
  }

  const out = await PDFDocument.create()
  const helvetica = await out.embedFont(StandardFonts.Helvetica)
  const pdfCache = new Map<string, PDFDocument>()
  const placementsByPage = groupByPage(placements)
  const textsByPage = groupByPage(textBoxes)

  for (const page of pages) {
    const source = sources[page.sourceId]
    if (!source) continue

    let outPage: PDFPage
    if (source.kind === 'pdf') {
      let lib = pdfCache.get(page.sourceId)
      if (!lib) {
        lib = await prepareSource(page.sourceId, source.bytes, formValues)
        pdfCache.set(page.sourceId, lib)
      }
      const [copied] = await out.copyPages(lib, [page.sourcePageNumber - 1])
      outPage = out.addPage(copied)
    } else {
      const img =
        source.ext.toLowerCase() === 'png'
          ? await out.embedPng(source.bytes)
          : await out.embedJpg(source.bytes)
      outPage = out.addPage([img.width, img.height])
      outPage.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
    }

    const finalR = (((outPage.getRotation().angle + page.rotation) % 360) + 360) % 360
    if (page.rotation % 360 !== 0) outPage.setRotation(degrees(finalR))

    for (const pl of placementsByPage.get(page.id) ?? []) {
      await drawSignatureOnPage(out, outPage, finalR, pl)
    }
    for (const tb of textsByPage.get(page.id) ?? []) {
      if (tb.text.trim()) drawTextBox(outPage, helvetica, tb, finalR)
    }
  }

  return out.save()
}
