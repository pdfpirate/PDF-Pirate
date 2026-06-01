import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'

export type SignatureType = 'signature' | 'initials'
export const MAX_PER_TYPE = 10

interface SigMeta {
  id: string
  type: SignatureType
  name: string
  createdAt: string
}

// Everything lives under the OS app-data folder — fully local, no cloud.
const dir = (): string => join(app.getPath('userData'), 'signatures')
const indexPath = (): string => join(dir(), 'index.json')
const pngPath = (id: string): string => join(dir(), `${id}.png`)

async function readIndex(): Promise<SigMeta[]> {
  try {
    return JSON.parse(await readFile(indexPath(), 'utf-8')) as SigMeta[]
  } catch {
    return []
  }
}

async function writeIndex(list: SigMeta[]): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(indexPath(), JSON.stringify(list, null, 2))
}

async function withDataUrl(meta: SigMeta): Promise<SigMeta & { dataUrl: string }> {
  try {
    const buf = await readFile(pngPath(meta.id))
    return { ...meta, dataUrl: `data:image/png;base64,${buf.toString('base64')}` }
  } catch {
    return { ...meta, dataUrl: '' }
  }
}

const fallbackName = (type: SignatureType): string =>
  type === 'initials' ? 'Initials' : 'Signature'

export async function listSignatures(): Promise<(SigMeta & { dataUrl: string })[]> {
  return Promise.all((await readIndex()).map(withDataUrl))
}

export async function saveSignature(
  type: SignatureType,
  name: string,
  png: Uint8Array
): Promise<SigMeta & { dataUrl: string }> {
  const list = await readIndex()
  if (list.filter((m) => m.type === type).length >= MAX_PER_TYPE) {
    throw new Error(`You can save up to ${MAX_PER_TYPE} ${type === 'initials' ? 'initials' : 'signatures'}.`)
  }
  await mkdir(dir(), { recursive: true })
  const meta: SigMeta = {
    id: randomUUID(),
    type,
    name: name.trim() || fallbackName(type),
    createdAt: new Date().toISOString()
  }
  await writeFile(pngPath(meta.id), Buffer.from(png))
  list.push(meta)
  await writeIndex(list)
  return withDataUrl(meta)
}

export async function updateSignature(
  id: string,
  name: string,
  png: Uint8Array | null
): Promise<SigMeta & { dataUrl: string }> {
  const list = await readIndex()
  const meta = list.find((m) => m.id === id)
  if (!meta) throw new Error('Signature not found.')
  meta.name = name.trim() || meta.name
  if (png && png.length) await writeFile(pngPath(id), Buffer.from(png))
  await writeIndex(list)
  return withDataUrl(meta)
}

export async function deleteSignature(id: string): Promise<{ ok: boolean }> {
  const list = await readIndex()
  await writeIndex(list.filter((m) => m.id !== id))
  await unlink(pngPath(id)).catch(() => undefined)
  return { ok: true }
}
