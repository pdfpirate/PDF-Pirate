import { useState } from 'react'
import { PageThumb } from './PageThumb'
import type { DocPage, Source } from '../lib/document'

interface PageSidebarProps {
  pages: DocPage[]
  sources: Record<string, Source>
  currentPage: number // 1-based ordinal of the page centered in the viewer
  onReorder: (dragId: string, targetId: string) => void
  onDelete: (pageId: string) => void
  onJump: (pageId: string) => void
  onAdd: () => void
}

/** Thumbnail strip: drag to reorder, ✕ to delete, click to jump, + to add. */
export function PageSidebar({
  pages,
  sources,
  currentPage,
  onReorder,
  onDelete,
  onJump,
  onAdd
}: PageSidebarProps): JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <div className="page-sidebar">
      <ol className="page-strip">
        {pages.map((page, i) => (
          <li
            key={page.id}
            className={`page-tile ${i + 1 === currentPage ? 'current' : ''} ${
              dragId === page.id ? 'dragging' : ''
            }`}
            draggable
            onDragStart={(e) => {
              setDragId(page.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', page.id)
            }}
            onDragEnter={() => {
              if (dragId && dragId !== page.id) onReorder(dragId, page.id)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnd={() => setDragId(null)}
            onClick={() => onJump(page.id)}
          >
            <div className="page-tile-thumb">
              <PageThumb page={page} source={sources[page.sourceId]} />
            </div>
            <span className="page-tile-num">{i + 1}</span>
            <button
              className="page-tile-del"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(page.id)
              }}
              aria-label={`Delete page ${i + 1}`}
            >
              ✕
            </button>
          </li>
        ))}
        <li className="page-add" onClick={onAdd}>
          <span className="page-add-plus">+</span>
          <span>Add</span>
        </li>
      </ol>
    </div>
  )
}
