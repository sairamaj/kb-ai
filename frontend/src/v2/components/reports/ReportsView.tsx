import { useQuery } from '@tanstack/react-query'
import type { UserReportRow, ModelReportRow } from '../../../types/reports'
import { USER_ROLE_LABELS } from '../../../types/auth'
import { getApiUrl } from '../../../api/base'
import type { V2Route } from '../../routing'

interface Props {
  navigate: (route: V2Route) => void
}

async function fetchUserReport(): Promise<UserReportRow[]> {
  const res = await fetch(getApiUrl('admin/reports/users'), { credentials: 'include' })
  if (!res.ok) {
    throw new Error(
      res.status === 403 ? 'Access denied' : `Failed to load report (${res.status})`,
    )
  }
  return res.json()
}

async function fetchModelReport(): Promise<ModelReportRow[]> {
  const res = await fetch(getApiUrl('admin/reports/models'), { credentials: 'include' })
  if (!res.ok) {
    throw new Error(
      res.status === 403 ? 'Access denied' : `Failed to load report (${res.status})`,
    )
  }
  return res.json()
}

function formatCost(cost: number | null): string {
  if (cost == null) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
  }).format(cost)
}

function formatRealSpend(usd: number | null): string {
  if (usd == null) return '—'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(usd)
}

function formatLastAccessed(iso: string | null): string {
  if (iso == null) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function userIdentifier(row: UserReportRow): string {
  if (row.display_name?.trim()) return row.display_name.trim()
  return row.email
}

export function ReportsView(_props: Props) {
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['admin', 'reports', 'users'],
    queryFn: fetchUserReport,
    staleTime: 60 * 1000,
  })
  const { data: models = [], isLoading: modelsLoading, error: modelsError } = useQuery({
    queryKey: ['admin', 'reports', 'models'],
    queryFn: fetchModelReport,
    staleTime: 60 * 1000,
  })

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Admin reports
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Usage, cost, and activity across all users. Admin only.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
            User report
          </h2>

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Loading…
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {error instanceof Error ? error.message : 'Failed to load user report.'}
            </p>
          )}

          {!isLoading && !error && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-left text-xs text-gray-700 dark:text-gray-300">
                <thead className="bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">User</th>
                    <th scope="col" className="px-3 py-2 font-medium">Role</th>
                    <th scope="col" className="px-3 py-2 font-medium">Last accessed</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Visits</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Collections</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Conversations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {users.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center text-gray-500 dark:text-gray-400"
                      >
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((row) => (
                      <tr
                        key={row.id}
                        className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {userIdentifier(row)}
                          </span>
                          {row.display_name?.trim() && (
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                              {row.email}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {USER_ROLE_LABELS[row.role as keyof typeof USER_ROLE_LABELS] ?? row.role}
                        </td>
                        <td className="px-3 py-2">{formatLastAccessed(row.last_accessed_at)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.visit_count}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.collection_count}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.conversation_count}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Model &amp; costs report
          </h2>

          {modelsLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Loading…
            </div>
          )}

          {modelsError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {modelsError instanceof Error ? modelsError.message : 'Failed to load model report.'}
            </p>
          )}

          {!modelsLoading && !modelsError && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-left text-xs text-gray-700 dark:text-gray-300">
                <thead className="bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Model</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Real spend (USD)
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Cost per 1K tokens (ref)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {models.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-4 text-center text-gray-500 dark:text-gray-400"
                      >
                        No models found.
                      </td>
                    </tr>
                  ) : (
                    models.map((row) => (
                      <tr
                        key={row.model}
                        className="bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/50"
                      >
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                          {row.model}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatRealSpend(row.real_cost_usd)}
                          {row.cost_period_label && row.real_cost_usd != null && (
                            <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">
                              {row.cost_period_label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCost(row.cost_per_1k_tokens)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            Real spend: use an <strong>organization</strong> API key (OpenAI → Organization
            settings), not a project key—project keys with "All" cannot access org costs. Gemini:
            reference cost only.
          </p>
        </section>
      </div>
    </main>
  )
}
