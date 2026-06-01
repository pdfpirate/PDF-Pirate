import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs bridged to the renderer. Kept intentionally small and explicit —
// the renderer can only call exactly what we expose here.
const api = {
  /** Open the native PDF file dialog. Resolves to the file's bytes, or null if cancelled. */
  openPdf: () => ipcRenderer.invoke('pdf:open'),
  /** Multi-select picker for PDFs + images. Resolves to an array (empty if cancelled). */
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  /** Save bytes via the native Save dialog. Resolves to the saved path, or null if cancelled. */
  savePdf: (bytes: Uint8Array, defaultName: string) =>
    ipcRenderer.invoke('pdf:save', bytes, defaultName),

  // --- Local signature/initials library ---
  listSignatures: () => ipcRenderer.invoke('signatures:list'),
  saveSignature: (type: string, name: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('signatures:save', type, name, bytes),
  updateSignature: (id: string, name: string, bytes: Uint8Array | null) =>
    ipcRenderer.invoke('signatures:update', id, name, bytes),
  deleteSignature: (id: string) => ipcRenderer.invoke('signatures:delete', id),

  // --- Quick Access (pinned files) ---
  listQuickFiles: () => ipcRenderer.invoke('quickfiles:list'),
  pickQuickFile: () => ipcRenderer.invoke('quickfiles:pick'),
  saveQuickFile: (name: string, path: string, thumb: string) =>
    ipcRenderer.invoke('quickfiles:save', name, path, thumb),
  removeQuickFile: (id: string) => ipcRenderer.invoke('quickfiles:remove', id),
  readQuickFile: (path: string) => ipcRenderer.invoke('quickfiles:read', path),

  // --- Recents (auto history of opened files, capped to 10) ---
  listRecents: () => ipcRenderer.invoke('recents:list'),
  addRecent: (name: string, path: string, thumb: string) =>
    ipcRenderer.invoke('recents:add', name, path, thumb),
  removeRecent: (id: string) => ipcRenderer.invoke('recents:remove', id),
  clearRecents: () => ipcRenderer.invoke('recents:clear')
}

// With context isolation on (the secure default), expose APIs via the bridge.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define on window when context isolation is disabled)
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
