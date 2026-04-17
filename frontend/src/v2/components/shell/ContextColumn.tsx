import type { ReactNode } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

interface Props {
  title: string
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Optional header actions (e.g., a "New Chat" button) */
  headerAction?: ReactNode
  children?: ReactNode
}

/**
 * Contextual second column in the v2 shell.
 * - Collapsible (Ctrl/Cmd+B).
 * - Each section renders its own content here (recent chats, tags filter, etc.).
 */
export function ContextColumn({ title, collapsed, onToggleCollapsed, headerAction, children }: Props) {
  if (collapsed) {
    return (
      <div className="flex h-full w-8 flex-col items-center border-r border-gray-200 bg-gray-50 py-3 dark:border-gray-800 dark:bg-gray-950/60">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
          title="Expand sidebar (Ctrl/Cmd+B)"
          className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-200/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <span className="h-4 w-4 block">
            <ChevronRightIcon />
          </span>
        </button>
      </div>
    )
  }

  return (
    <aside
      aria-label={title}
      className="flex h-full w-72 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/60"
    >
      <header className="flex items-center justify-between px-4 pb-2 pt-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h2>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="Collapse sidebar"
          title="Collapse sidebar (Ctrl/Cmd+B)"
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <span className="h-3.5 w-3.5 block">
            <ChevronLeftIcon />
          </span>
        </button>
      </header>
      {headerAction && <div className="px-3 pb-2">{headerAction}</div>}
      <div className="flex-1 overflow-y-auto px-2 pb-4">{children}</div>
    </aside>
  )
}
