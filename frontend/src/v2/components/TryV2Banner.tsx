import { useEffect, useState } from 'react'

const DISMISS_KEY = 'kb.tryV2Banner.dismissed'

/**
 * A small dismissible toast shown in the classic shell that invites the user
 * to try the new (v2) UI. Navigates to /v2 when clicked; remembers dismissal
 * in localStorage so it does not nag on every page load.
 */
export function TryV2Banner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      if (!dismissed) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  function tryIt() {
    window.location.assign('/v2')
  }

  return (
    <div
      role="region"
      aria-label="Try the new UI"
      className="fixed bottom-4 right-4 z-40 flex max-w-xs items-start gap-3 rounded-lg border border-indigo-200 bg-white p-3 shadow-lg dark:border-indigo-900 dark:bg-gray-900"
    >
      <div className="flex-1 text-xs text-gray-700 dark:text-gray-200">
        <p className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
          Try the new UI
        </p>
        <p className="text-gray-600 dark:text-gray-400">
          We redesigned navigation with a sidebar, command palette, and cleaner
          library. Give it a try — classic stays one click away.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={tryIt}
            className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Open new UI
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
