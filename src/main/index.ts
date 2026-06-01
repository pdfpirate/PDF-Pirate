import { app, shell, BrowserWindow, dialog, ipcMain, nativeImage } from 'electron'
import { join, basename, extname } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from '../../build/icon.png?asset'
import {
  listSignatures,
  saveSignature,
  updateSignature,
  deleteSignature,
  type SignatureType
} from './signatures'
import { listQuickFiles, saveQuickFile, removeQuickFile } from './quickfiles'
import { listRecents, addRecent, removeRecent, clearRecents } from './recents'

/** IPC handlers exposed to the renderer via the preload bridge. */
function registerIpcHandlers(): void {
  // Native "Open PDF" dialog → returns the file's bytes (or null if cancelled).
  ipcMain.handle('pdf:open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    })
    if (canceled || filePaths.length === 0) return null
    const filePath = filePaths[0]
    const data = await readFile(filePath)
    return { name: basename(filePath), path: filePath, data: new Uint8Array(data) }
  })

  // Multi-select picker for PDFs + images (used by Combine).
  ipcMain.handle('files:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Add PDFs or images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF & Images', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }]
    })
    if (canceled) return []
    return Promise.all(
      filePaths.map(async (filePath) => ({
        name: basename(filePath),
        path: filePath,
        ext: extname(filePath).slice(1).toLowerCase(),
        data: new Uint8Array(await readFile(filePath))
      }))
    )
  })

  // Save bytes to a user-chosen location via the native Save dialog.
  ipcMain.handle('pdf:save', async (_event, bytes: Uint8Array, defaultName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save PDF',
      defaultPath: defaultName,
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, bytes)
    return filePath
  })

  // Local signature/initials library (stored under userData — no cloud).
  ipcMain.handle('signatures:list', () => listSignatures())
  ipcMain.handle('signatures:save', (_event, type: SignatureType, name: string, bytes: Uint8Array) =>
    saveSignature(type, name, bytes)
  )
  ipcMain.handle(
    'signatures:update',
    (_event, id: string, name: string, bytes: Uint8Array | null) =>
      updateSignature(id, name, bytes)
  )
  ipcMain.handle('signatures:delete', (_event, id: string) => deleteSignature(id))

  // Quick Access — pinned files the user opens often.
  ipcMain.handle('quickfiles:list', () => listQuickFiles())
  ipcMain.handle('quickfiles:pick', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Pin a file',
      properties: ['openFile'],
      filters: [{ name: 'PDF & Images', extensions: ['pdf', 'png', 'jpg', 'jpeg'] }]
    })
    if (canceled || !filePaths[0]) return null
    const p = filePaths[0]
    return {
      name: basename(p),
      path: p,
      ext: extname(p).slice(1).toLowerCase(),
      data: new Uint8Array(await readFile(p))
    }
  })
  ipcMain.handle('quickfiles:save', (_event, name: string, path: string, thumb: string) =>
    saveQuickFile(name, path, thumb)
  )
  ipcMain.handle('quickfiles:remove', (_event, id: string) => removeQuickFile(id))
  ipcMain.handle('quickfiles:read', async (_event, p: string) => {
    try {
      return {
        name: basename(p),
        ext: extname(p).slice(1).toLowerCase(),
        data: new Uint8Array(await readFile(p))
      }
    } catch {
      return null // file moved or deleted
    }
  })

  // Recents — auto-populated history of opened files (capped to the 10 most recent).
  ipcMain.handle('recents:list', () => listRecents())
  ipcMain.handle('recents:add', (_event, name: string, path: string, thumb: string) =>
    addRecent(name, path, thumb)
  )
  ipcMain.handle('recents:remove', (_event, id: string) => removeRecent(id))
  ipcMain.handle('recents:clear', () => clearRecents())
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'PDF Pirate',
    backgroundColor: '#eef2f3',
    icon: appIcon, // Windows/Linux window + taskbar icon (incl. dev)
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite serves the renderer over HTTP in dev (HMR) and from disk in prod.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.pdfpirate')

  // macOS shows the bundled .icns once packaged, but in dev the Dock falls back
  // to Electron's default — override it so the logo shows everywhere.
  if (is.dev && process.platform === 'darwin') {
    app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '../../build/icon.png')))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    // macOS: re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // macOS apps typically stay active until the user quits explicitly (Cmd+Q).
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
