import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../context/AuthContext'
import { ContextColumn } from '../shell/ContextColumn'
import { PlusIcon, SearchIcon } from '../shell/icons'
import { TopicDetailPane } from './TopicDetailPane'
import type {
  LearningTopicListItem,
  LearningTopicDetail,
  CreateLearningTopicPayload,
} from '../../../types/learningTopic'
import { getApiUrl } from '../../../api/base'
import { parseJsonSafe, userFacingApiError } from '../../../api/errors'
import { useDebounce } from '../../hooks/useDebounce'
import type { V2Route } from '../../routing'

interface Props {
  route: Extract<V2Route, { name: 'topics' }>
  navigate: (route: V2Route) => void
  ctxCollapsed: boolean
  onToggleCtx: () => void
}

interface TopicProgressSummary {
  reviewed: number
  total: number
}

export function TopicsView({ route, navigate, ctxCollapsed, onToggleCtx }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [topics, setTopics] = useState<LearningTopicListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const debouncedQuery = useDebounce(q, 250)

  const [showCreate, setShowCreate] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createVisibility, setCreateVisibility] = useState<'private' | 'public'>('private')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Cache of per-topic progress for inline progress bars in the list.
  const [progressMap, setProgressMap] = useState<Record<string, TopicProgressSummary>>({})

  const atLimit = useMemo(() => {
    const usage = user?.usage
    if (!usage) return false
    return usage.learning_topics_limit != null &&
      usage.learning_topics_used >= usage.learning_topics_limit
  }, [user])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetch(getApiUrl('learning-topics'), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json() as Promise<LearningTopicListItem[]>
      })
      .then((data) => {
        if (!cancelled) setTopics(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Lazy fetch progress for visible topics.
  useEffect(() => {
    const missing = topics.filter((t) => !progressMap[t.id])
    if (missing.length === 0) return
    let cancelled = false
    void Promise.all(
      missing.slice(0, 20).map(async (t) => {
        try {
          const res = await fetch(getApiUrl(`learning-topics/${t.id}`), { credentials: 'include' })
          if (!res.ok) return null
          const detail = (await res.json()) as LearningTopicDetail
          const items = detail.items ?? detail.conversations.map(() => ({ reviewed_at: null }))
          const reviewed = items.filter(
            (it) => (it as { reviewed_at?: string | null }).reviewed_at != null &&
              (it as { reviewed_at?: string | null }).reviewed_at !== '',
          ).length
          return { id: t.id, progress: { reviewed, total: items.length } }
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const next = { ...progressMap }
      for (const r of results) {
        if (r) next[r.id] = r.progress
      }
      setProgressMap(next)
    })
    return () => {
      cancelled = true
    }
  // Only re-run when the list of topic IDs changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics.map((t) => t.id).join(',')])

  const filteredTopics = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase()
    if (!needle) return topics
    return topics.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.description ?? '').toLowerCase().includes(needle),
    )
  }, [topics, debouncedQuery])

  async function handleCreate() {
    const title = createTitle.trim()
    if (!title) {
      setCreateError('Title is required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const body: CreateLearningTopicPayload = {
        title,
        description: createDesc.trim() || null,
        visibility: createVisibility,
      }
      const res = await fetch(getApiUrl('learning-topics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(userFacingApiError(res.status, data))
      }
      const created = (await res.json()) as LearningTopicListItem
      setTopics((prev) => [created, ...prev])
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setShowCreate(false)
      setCreateTitle('')
      setCreateDesc('')
      setCreateVisibility('private')
      navigate({ name: 'topics', topicId: created.id })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Create failed.')
    } finally {
      setCreating(false)
    }
  }

  const handleDeletedTopic = useCallback(() => {
    setTopics((prev) => prev.filter((t) => t.id !== route.topicId))
    navigate({ name: 'topics' })
  }, [navigate, route.topicId])

  const handleDetailChanged = useCallback((detail: LearningTopicDetail) => {
    setTopics((prev) =>
      prev.map((t) =>
        t.id === detail.id
          ? {
              ...t,
              title: detail.title,
              description: detail.description,
              visibility: detail.visibility,
              conversation_count: (detail.items ?? detail.conversations).length,
              updated_at: detail.updated_at,
            }
          : t,
      ),
    )
    const items = detail.items ?? detail.conversations.map(() => ({ reviewed_at: null }))
    const reviewed = items.filter(
      (it) => (it as { reviewed_at?: string | null }).reviewed_at != null &&
        (it as { reviewed_at?: string | null }).reviewed_at !== '',
    ).length
    setProgressMap((prev) => ({ ...prev, [detail.id]: { reviewed, total: items.length } }))
  }, [])

  return (
    <>
      <ContextColumn
        title="Learning Topics"
        collapsed={ctxCollapsed}
        onToggleCollapsed={onToggleCtx}
        headerAction={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={atLimit}
            title={atLimit ? 'Plan limit reached' : 'New topic'}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            <span className="h-3.5 w-3.5">
              <PlusIcon />
            </span>
            New topic
          </button>
        }
      >
        <div className="mb-2 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900">
          <span className="h-3.5 w-3.5 text-gray-400">
            <SearchIcon />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter topics"
            data-v2-search="topics"
            className="w-full bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        {loading && (
          <div className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">Loading…</div>
        )}
        {error && (
          <div className="px-2 py-2 text-[11px] text-red-600 dark:text-red-400">{error}</div>
        )}
        {!loading && filteredTopics.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">
            {topics.length === 0 ? 'No topics yet.' : 'No matches.'}
          </div>
        )}

        <ul className="flex flex-col gap-1">
          {filteredTopics.map((t) => {
            const progress = progressMap[t.id]
            const pct = progress && progress.total > 0
              ? Math.round((progress.reviewed / progress.total) * 100)
              : 0
            const selected = route.topicId === t.id
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'topics', topicId: t.id })}
                  className={[
                    'w-full rounded-md px-2 py-1.5 text-left',
                    selected
                      ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
                      : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-200 dark:hover:bg-gray-800',
                  ].join(' ')}
                  title={t.title}
                >
                  <div className="truncate text-xs font-medium">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {t.conversation_count} items
                    </span>
                    {progress && progress.total > 0 && (
                      <>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                          <span
                            className="block h-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
                          {pct}%
                        </span>
                      </>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </ContextColumn>

      <main className="flex-1 overflow-hidden">
        {route.topicId ? (
          <TopicDetailPane
            key={route.topicId}
            topicId={route.topicId}
            navigate={navigate}
            onDeleted={handleDeletedTopic}
            onChanged={handleDetailChanged}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                Pick a topic
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Select a learning topic on the left to view items, track progress, run replay
                mode, or practice flashcards.
              </p>
              {!atLimit && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
                >
                  <span className="h-3.5 w-3.5">
                    <PlusIcon />
                  </span>
                  New topic
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {showCreate && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-topic-title"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <h3 id="create-topic-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              New learning topic
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Title
                </label>
                <input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  disabled={creating}
                  autoFocus
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Description (optional)
                </label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  disabled={creating}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Visibility
                </label>
                <div className="mt-1 flex gap-1">
                  {(['private', 'public'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCreateVisibility(v)}
                      className={[
                        'rounded px-2.5 py-1 text-xs capitalize',
                        createVisibility === v
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                      ].join(' ')}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {createError && (
                <div className="text-xs text-red-600 dark:text-red-400">{createError}</div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false)
                  setCreateError(null)
                }}
                disabled={creating}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !createTitle.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create topic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
