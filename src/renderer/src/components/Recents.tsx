import { useCallback, useEffect, useState } from 'react'

interface RecentFile {
  id: string
  name: string
  path: string
  thumb: string
  openedAt: string
}

interface OpenedFile {
  name: string
  ext: string
  data: Uint8Array
  path?: string
}

interface RecentsProps {
  onOpen: (file: OpenedFile) => void
}

/** Home-screen list of recently opened files (auto-populated, capped to 10 in main). */
export function Recents({ onOpen }: RecentsProps): JSX.Element | null {
  const [files, setFiles] = useState<RecentFile[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setFiles(await window.api.listRecents())
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleOpen = useCallback(
    async (rf: RecentFile) => {
      try {
        // readQuickFile is a generic "read bytes at this path" — reused for recents.
        const file = await window.api.readQuickFile(rf.path)
        if (!file) {
          setError(`“${rf.name}” couldn’t be found — it may have been moved or deleted.`)
          return
        }
        setError(null)
        onOpen({ name: file.name, ext: file.ext, data: file.data, path: rf.path })
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
        await window.api.removeRecent(id)
        await refresh()
      } catch {
        // ignore
      }
    },
    [refresh]
  )

  const handleClear = useCallback(async () => {
    try {
      await window.api.clearRecents()
      await refresh()
    } catch {
      // ignore
    }
  }, [refresh])

  // Hidden until the dev server has loaded the Recents bridge.
  if (!window.api?.listRecents) return null

  return (
    <section className="home-panel">
      <div className="quick-head">
        <span className="panel-icon" aria-hidden="true" style={{ position: 'relative', top: '1px' }}>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3.5 2" />
          </svg>
        </span>
        <h2>Recents</h2>
        <span className="quick-sub">Files you opened recently</span>
        {files.length > 0 && (
          <button className="panel-clear" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {error && <div className="banner error inline">{error}</div>}

      <div className="panel-scroll">
        {files.length === 0 ? (
          <p className="panel-empty">Files you open will show up here.</p>
        ) : (
          <div className="quick-grid">
            {files.map((rf) => (
              <button
                className="quick-card"
                key={rf.id}
                onClick={() => handleOpen(rf)}
                title={rf.path}
              >
                <div className="quick-thumb">
                  {rf.thumb ? (
                    <img src={rf.thumb} alt="" />
                  ) : (
                    <span className="quick-ext">
                      {(rf.name.split('.').pop() || '').toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="quick-name">{rf.name}</span>
                <span
                  className="quick-del"
                  role="button"
                  aria-label={`Remove ${rf.name} from recents`}
                  onClick={(e) => handleRemove(rf.id, e)}
                >
                  ✕
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
