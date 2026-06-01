import { app } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

export interface RecentFile {
  id: string
  name: string
  path: string
  thumb: string // data URL preview
  openedAt: string
}

/** Recents are auto-populated on open and capped to the most recent N. */
const MAX_RECENTS = 10

const dir = (): string => join(app.getPath('userData'), 'recents')
const indexPath = (): string => join(dir(), 'index.json')

async function read(): Promise<RecentFile[]> {
  try {
    return JSON.parse(await readFile(indexPath(), 'utf-8')) as RecentFile[]
  } catch {
    return []
  }
}

async function write(list: RecentFile[]): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(indexPath(), JSON.stringify(list, null, 2))
}

export async function listRecents(): Promise<RecentFile[]> {
  return read()
}

/**
 * Record a freshly-opened file. De-dupes by path (an already-seen file moves to
 * the front) and trims the list to the {@link MAX_RECENTS} most recent entries.
 */
export async function addRecent(name: string, path: string, thumb: string): Promise<RecentFile[]> {
  const list = (await read()).filter((r) => r.path !== path)
  const entry: RecentFile = {
    id: randomUUID(),
    name,
    path,
    thumb,
    openedAt: new Date().toISOString()
  }
  const next = [entry, ...list].slice(0, MAX_RECENTS)
  await write(next)
  return next
}

export async function removeRecent(id: string): Promise<{ ok: boolean }> {
  const list = await read()
  await write(list.filter((r) => r.id !== id))
  return { ok: true }
}

export async function clearRecents(): Promise<{ ok: boolean }> {
  await write([])
  return { ok: true }
}
