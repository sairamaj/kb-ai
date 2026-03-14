interface Props {
  /** Human-friendly message (e.g. from backend detail or built from resource type). */
  message: string
  /** Resource that hit the limit: 'conversation' | 'collection'. */
  resource: 'conversation' | 'collection'
  onClose: () => void
}

const UPGRADE_MESSAGE =
  'Upgrade to Pro for higher limits. Contact your administrator or use your plan settings to upgrade.'

export function LimitReachedDialog({ message, resource, onClose }: Props) {
  const label = resource === 'conversation' ? 'Conversation' : 'Collection'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"
            aria-hidden
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {label} limit reached
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{message}</p>
          </div>
        </div>
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
          <p className="text-sm text-indigo-800 dark:text-indigo-200">{UPGRADE_MESSAGE}</p>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
