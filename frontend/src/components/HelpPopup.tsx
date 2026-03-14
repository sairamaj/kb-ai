/**
 * Help chat popup in the right lower corner (CB-06, CB-07).
 * Floating trigger button + popup panel with HelpChat.
 */
import { useEffect, useRef } from 'react'
import { HelpChat } from './HelpChat'

interface Props {
  open: boolean
  onOpen: () => void
  onClose: () => void
}

export function HelpPopup({ open, onOpen, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" aria-label="Application help">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="App help chat"
          className="flex flex-col w-[380px] max-h-[85vh] h-[500px] rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-950 shadow-xl overflow-hidden"
        >
          <header className="flex items-center justify-between flex-shrink-0 px-3 py-2 border-b border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-lg bg-amber-500 flex items-center justify-center text-white"
                title="Application help"
                aria-hidden
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">App help</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close help"
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div className="flex-1 flex flex-col min-h-0 text-gray-900 dark:text-gray-100">
            <HelpChat />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={open ? onClose : onOpen}
        aria-label={open ? 'Close help' : 'Open application help'}
        aria-expanded={open}
        className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 dark:focus:ring-offset-gray-950"
        title="App help"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
    </div>
  )
}
