import { ElectronAPI } from '@electron-toolkit/preload'

/** A PDF file opened through the native dialog. */
export interface OpenedPdf {
  name: string
  path: string
  data: Uint8Array
}

/** A file (PDF or image) added through the multi-select picker. */
export interface PickedFile {
  name: string
  path: string
  ext: string
  data: Uint8Array
}

export type SignatureType = 'signature' | 'initials'

/** A saved signature or initials, with its PNG as a data URL for display. */
export interface SavedSignature {
  id: string
  type: SignatureType
  name: string
  createdAt: string
  dataUrl: string
}

/** A pinned file shown in Quick Access. */
export interface QuickFile {
  id: string
  name: string
  path: string
  thumb: string
  addedAt: string
}

/** A recently-opened file shown in Recents. */
export interface RecentFile {
  id: string
  name: string
  path: string
  thumb: string
  openedAt: string
}

/** A file read from disk (for opening). */
export interface ReadFile {
  name: string
  ext: string
  data: Uint8Array
}

/** The custom API surface exposed to the renderer (see preload/index.ts). */
export interface PdfPirateApi {
  openPdf: () => Promise<OpenedPdf | null>
  pickFiles: () => Promise<PickedFile[]>
  savePdf: (bytes: Uint8Array, defaultName: string) => Promise<string | null>
  listSignatures: () => Promise<SavedSignature[]>
  saveSignature: (type: SignatureType, name: string, bytes: Uint8Array) => Promise<SavedSignature>
  updateSignature: (
    id: string,
    name: string,
    bytes: Uint8Array | null
  ) => Promise<SavedSignature>
  deleteSignature: (id: string) => Promise<{ ok: boolean }>
  listQuickFiles: () => Promise<QuickFile[]>
  pickQuickFile: () => Promise<(ReadFile & { path: string }) | null>
  saveQuickFile: (name: string, path: string, thumb: string) => Promise<QuickFile>
  removeQuickFile: (id: string) => Promise<{ ok: boolean }>
  readQuickFile: (path: string) => Promise<ReadFile | null>
  listRecents: () => Promise<RecentFile[]>
  addRecent: (name: string, path: string, thumb: string) => Promise<RecentFile[]>
  removeRecent: (id: string) => Promise<{ ok: boolean }>
  clearRecents: () => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: PdfPirateApi
  }
}
