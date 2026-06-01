import { useEffect } from 'react'
import type { SavedSignature } from '../lib/signatures'
import { SignaturesPanel } from './SignaturesPanel'

interface SignPopoverProps {
  onPick: (sig: SavedSignature) => void
  onClose: () => void
}

/** In-viewer bubble: a mini Sign tab — manage signatures and pick one to stamp. */
export function SignPopover({ onPick, onClose }: SignPopoverProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="popover-scrim" onMouseDown={onClose} />
      <div className="sign-popover" onMouseDown={(e) => e.stopPropagation()}>
        <SignaturesPanel compact onPick={onPick} />
      </div>
    </>
  )
}
