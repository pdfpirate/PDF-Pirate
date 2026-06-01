import { useCallback, useEffect, useState } from 'react'
import { renderFileThumb } from '../lib/thumb'

interface QuickFile {
  id: string
  name: string
  path: string
  thumb: string
  addedAt: string
}

interface OpenedFile {
  name: string
  ext: string
  data: Uint8Array
  path?: string
}

interface QuickAccessProps {
  onOpen: (file: OpenedFile) => void
}

/** Home-screen section of pinned files the user opens often. */
export function QuickAccess({ onOpen }: QuickAccessProps): JSX.Element | null {
  const [files, setFiles] = useState<QuickFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setFiles(await window.api.listQuickFiles())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAdd = useCallback(async () => {
    try {
      const picked = await window.api.pickQuickFile()
      if (!picked) return
      setBusy(true)
      let thumb = ''
      try {
        thumb = await renderFileThumb(picked.ext, picked.data)
      } catch {
        // leave a blank thumb if preview fails
      }
      await window.api.saveQuickFile(picked.name, picked.path, thumb)
      setError(null)
      await refresh()
    } catch {
      setError('Could not pin that file.')
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const handleOpen = useCallback(
    async (qf: QuickFile) => {
      try {
        const file = await window.api.readQuickFile(qf.path)
        if (!file) {
          setError(`“${qf.name}” couldn’t be found — it may have been moved or deleted.`)
          return
        }
        setError(null)
        onOpen({ name: file.name, ext: file.ext, data: file.data, path: qf.path })
      } catch {
        setError('Could not open that file.')
      }
    },
    [onOpen]
  )

  const handleRemove = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await window.api.removeQuickFile(id)
        await refresh()
      } catch {
        // ignore
      }
    },
    [refresh]
  )

  // Hidden until the dev server has loaded the Quick Access bridge.
  if (!window.api?.listQuickFiles) return null

  return (
    <section className="home-panel">
      <div className="quick-head">
        <span className="panel-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 18.56l-5.88 3.09 1.12-6.55L2.48 9.4l6.58-.96L12 2.5z" />
          </svg>
        </span>
        <h2>Quick Access</h2>
        <span className="quick-sub">Pin files you open often</span>
      </div>

      {error && <div className="banner error inline">{error}</div>}

      <div className="panel-scroll">
        <div className="quick-grid">
          {files.map((qf) => (
            <button
              className="quick-card"
              key={qf.id}
              onClick={() => handleOpen(qf)}
              title={qf.path}
            >
              <div className="quick-thumb">
                {qf.thumb ? (
                  <img src={qf.thumb} alt="" />
                ) : (
                  <span className="quick-ext">
                    {(qf.name.split('.').pop() || '').toUpperCase()}
                  </span>
                )}
              </div>
              <span className="quick-name">{qf.name}</span>
              <span
                className="quick-del"
                role="button"
                aria-label={`Unpin ${qf.name}`}
                onClick={(e) => handleRemove(qf.id, e)}
              >
                ✕
              </span>
            </button>
          ))}

          <button className="quick-card add" onClick={handleAdd} disabled={busy}>
            <div className="quick-thumb add">
              <span className="quick-add-plus">+</span>
            </div>
            <span className="quick-name">{busy ? 'Adding…' : 'Pin a file'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
