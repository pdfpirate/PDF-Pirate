import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

export interface QuickFile {
  id: string
  name: string
  path: string
  thumb: string // data URL preview
  addedAt: string
}

const dir = (): string => join(app.getPath('userData'), 'quickfiles')
const indexPath = (): string => join(dir(), 'index.json')

async function read(): Promise<QuickFile[]> {
  try {
    return JSON.parse(await readFile(indexPath(), 'utf-8')) as QuickFile[]
  } catch {
    return []
  }
}

async function write(list: QuickFile[]): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(indexPath(), JSON.stringify(list, null, 2))
}

export async function listQuickFiles(): Promise<QuickFile[]> {
  return read()
}

export async function saveQuickFile(name: string, path: string, thumb: string): Promise<QuickFile> {
  const list = await read()
  const existing = list.find((q) => q.path === path)
  if (existing) {
    existing.name = name
    existing.thumb = thumb
    await write(list)
    return existing
  }
  const entry: QuickFile = { id: randomUUID(), name, path, thumb, addedAt: new Date().toISOString() }
  list.push(entry)
  await write(list)
  return entry
}

export async function removeQuickFile(id: string): Promise<{ ok: boolean }> {
  const list = await read()
  await write(list.filter((q) => q.id !== id))
  return { ok: true }
}
