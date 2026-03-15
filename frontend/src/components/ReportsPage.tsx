/**
 * Admin-only Reports page (REP-02).
 * Visible only to administrators; non-admins are redirected or get 403 from API.
 */
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  onBack: () => void
}

export function ReportsPage({ onBack }: Props) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col">
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              ← Back
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                KB
              </div>
              <span className="font-semibold text-sm">Admin reports</span>
            </div>
          </div>
          <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-800 pl-3">
            <ThemeToggle />
            <span className="text-sm text-gray-700 dark:text-gray-300">{user?.display_name}</span>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Report pages (user report, model and costs) will be added in later phases.
        </p>
      </main>
    </div>
  )
}
