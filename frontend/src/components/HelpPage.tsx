/**
 * Full-page in-app help chatbot UI (CB-06, CB-07, CB-08).
 * Uses HelpChat for the chat body. Kept for potential full-page use; primary UI is HelpPopup.
 */
import { HelpChat } from './HelpChat'

interface Props {
  onBack: () => void
}

export function HelpPage({ onBack }: Props) {
  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white"
              title="Application help"
              aria-hidden
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">App help</span>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Questions about the app—features, saving, library, collections, plans
        </p>
      </header>

      <div className="flex-1 flex flex-col min-h-0">
        <HelpChat />
      </div>
    </div>
  )
}
