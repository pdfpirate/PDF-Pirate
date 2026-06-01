import { useCallback, useEffect, useState } from 'react'
import { MAX_PER_TYPE, typeLabel, type SavedSignature, type SignatureType } from '../lib/signatures'
import { SignaturePad } from './SignaturePad'

interface PadState {
  type: SignatureType
  edit?: { id: string; name: string; dataUrl: string }
}

interface SignaturesPanelProps {
  /** When provided, clicking a card's preview picks it (e.g. to stamp on a page). */
  onPick?: (sig: SavedSignature) => void
  /** Tighter layout for use inside the in-viewer popover. */
  compact?: boolean
}

export function SignaturesPanel({ onPick, compact }: SignaturesPanelProps = {}): JSX.Element {
  const [all, setAll] = useState<SavedSignature[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pad, setPad] = useState<PadState | null>(null)

  const refresh = useCallback(async () => {
    try {
      if (!window.api?.listSignatures) {
        setError('Signature storage unavailable — fully restart the dev server (Ctrl+C, then npm run dev).')
        return
      }
      setAll(await window.api.listSignatures())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load signatures.')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.api.deleteSignature(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.')
    }
  }

  const renderSection = (type: SignatureType): JSX.Element => {
    const items = all.filter((s) => s.type === type)
    const heading = type === 'initials' ? 'Initials' : 'Signatures'
    const full = items.length >= MAX_PER_TYPE

    return (
      <section className="sig-section">
        <div className="sig-section-head">
          <h3>{heading}</h3>
          <span className={`sig-count ${full ? 'full' : ''}`}>
            {items.length}/{MAX_PER_TYPE}
          </span>
        </div>

        <div className="sig-grid">
          {items.map((s) => (
            <div className="sig-card" key={s.id}>
              {onPick ? (
                <button
                  className="sig-preview pick"
                  onClick={() => onPick(s)}
                  title="Click to place on the page"
                >
                  <img src={s.dataUrl} alt={s.name} />
                  <span className="pick-hint">Place</span>
                </button>
              ) : (
                <div className="sig-preview">
                  <img src={s.dataUrl} alt={s.name} />
                </div>
              )}
              <div className="sig-meta">
                <span className="sig-name" title={s.name}>
                  {s.name}
                </span>
                <div className="sig-actions">
                  <button
                    className="btn icon sm"
                    onClick={() => setPad({ type, edit: { id: s.id, name: s.name, dataUrl: s.dataUrl } })}
                    aria-label={`Edit ${s.name}`}
                  >
                    ✎
                  </button>
                  <button
                    className="btn icon sm danger"
                    onClick={() => handleDelete(s.id)}
                    aria-label={`Delete ${s.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!full && (
            <button className="sig-add" onClick={() => setPad({ type })}>
              <span className="sig-add-plus">+</span>
              <span>Add {typeLabel(type)}</span>
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <div className={`sign-panel ${compact ? 'compact' : ''}`}>
      <div className="sign-head">
        <h2>Signatures &amp; initials</h2>
        <p>
          Draw or type up to {MAX_PER_TYPE} of each. Stored locally on your machine — never uploaded.
        </p>
      </div>

      {error && <div className="banner error">{error}</div>}

      {renderSection('signature')}
      {renderSection('initials')}

      {pad && (
        <SignaturePad
          type={pad.type}
          edit={pad.edit}
          onClose={() => setPad(null)}
          onSaved={() => {
            setPad(null)
            void refresh()
          }}
        />
      )}
    </div>
  )
}
