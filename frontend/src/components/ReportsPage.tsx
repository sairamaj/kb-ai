/**
 * Admin-only Reports page (REP-02, REP-08).
 * Visible only to administrators; non-admins are redirected or get 403 from API.
 * User report table: identifier, role, last accessed, visits, collections, conversations.
 */
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import type { UserReportRow } from '../types/reports'
import { USER_ROLE_LABELS } from '../types/auth'
import { ThemeToggle } from './ThemeToggle'

interface Props {
  onBack: () => void
}

async function fetchUserReport(): Promise<UserReportRow[]> {
  const res = await fetch('/api/admin/reports/users', { credentials: 'include' })
  if (!res.ok) throw new Error(res.status === 403 ? 'Access denied' : `Failed to load report (${res.status})`)
  return res.json()
}

function formatLastAccessed(iso: string | null): string {
  if (iso == null) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

function userIdentifier(row: UserReportRow): string {
  if (row.display_name?.trim()) return row.display_name.trim()
  return row.email
}

export function ReportsPage({ onBack }: Props) {
  const { user, logout } = useAuth()
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'reports', 'users'],
    queryFn: fetchUserReport,
    staleTime: 60 * 1000,
  })

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
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">User report</h1>

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-sm">
            <span className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            Loading…
          </div>
        )}

        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm">
            {error instanceof Error ? error.message : 'Failed to load user report.'}
          </p>
        )}

        {!isLoading && !error && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm text-left text-gray-700 dark:text-gray-300">
              <thead className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">User</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Last accessed</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Visits</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Collections</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Conversations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  users.map((row) => (
                    <tr key={row.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{userIdentifier(row)}</span>
                        {row.display_name?.trim() && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{row.email}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {USER_ROLE_LABELS[row.role as keyof typeof USER_ROLE_LABELS] ?? row.role}
                      </td>
                      <td className="px-4 py-3">{formatLastAccessed(row.last_accessed_at)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.visit_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.collection_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.conversation_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-gray-500 dark:text-gray-400 text-xs">
          Model and costs report will be added in a later phase.
        </p>
      </main>
    </div>
  )
}
