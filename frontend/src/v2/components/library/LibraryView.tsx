import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ContextColumn } from '../shell/ContextColumn'
import { SearchIcon } from '../shell/icons'
import { FilterDrawer, type LibraryFilters } from './FilterDrawer'
import { ConversationResultCard } from './ConversationResultCard'
import { NoteResultCard } from './NoteResultCard'
import { TopicResultCard } from './TopicResultCard'
import { ConversationDetailPane } from './ConversationDetailPane'
import { NoteDetailPane } from './NoteDetailPane'
import { useDebounce } from '../../hooks/useDebounce'
import type { ConversationSummary } from '../../../types/conversation'
import type { NoteSummary, NoteDetail } from '../../../types/note'
import type { LearningTopicListItem } from '../../../types/learningTopic'
import type { UnifiedSearchItem } from '../../../types/search'
import { getApiUrl } from '../../../api/base'
import type { V2Route, LibraryTab } from '../../routing'

interface Props {
  route: Extract<V2Route, { name: 'library' }>
  navigate: (route: V2Route) => void
  ctxCollapsed: boolean
  onToggleCtx: () => void
}

interface TabDef {
  id: LibraryTab
  label: string
}

const TABS: TabDef[] = [
  { id: 'conversations', label: 'Conversations' },
  { id: 'notes', label: 'Notes' },
  { id: 'topics', label: 'Topics' },
]

export function LibraryView({ route, navigate, ctxCollapsed, onToggleCtx }: Props) {
  const queryClient = useQueryClient()

  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<LibraryFilters>({
    searchMode: 'keyword',
    searchScope: 'tab',
    sort: 'recent',
    tags: [],
  })
  const [allTags, setAllTags] = useState<string[]>([])

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [convLoading, setConvLoading] = useState(false)
  const [convError, setConvError] = useState<string | null>(null)

  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)

  const [topics, setTopics] = useState<LearningTopicListItem[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [topicsError, setTopicsError] = useState<string | null>(null)

  const [unifiedResults, setUnifiedResults] = useState<UnifiedSearchItem[]>([])
  const [unifiedLoading, setUnifiedLoading] = useState(false)
  const [unifiedError, setUnifiedError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(q, 300)

  function setTab(tab: LibraryTab) {
    navigate({ name: 'library', tab })
  }

  function selectItem(id: string | undefined) {
    navigate({ name: 'library', tab: route.tab, selectedId: id })
  }

  // Tags list (for filter).
  useEffect(() => {
    void fetch(getApiUrl('conversations/tags'), { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : []))
      .then(setAllTags)
      .catch(() => undefined)
  }, [])

  // Conversations fetch.
  useEffect(() => {
    if (route.tab !== 'conversations' || filters.searchScope === 'all') return
    setConvLoading(true)
    setConvError(null)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('search_mode', filters.searchMode)
    filters.tags.forEach((t) => params.append('tags', t))
    params.set('sort', filters.sort)
    void fetch(getApiUrl(`conversations?${params.toString()}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json() as Promise<ConversationSummary[]>
      })
      .then(setConversations)
      .catch((err) => setConvError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setConvLoading(false))
  }, [route.tab, debouncedQuery, filters.searchMode, filters.tags, filters.sort, filters.searchScope])

  // Notes fetch.
  useEffect(() => {
    if (route.tab !== 'notes' || filters.searchScope === 'all') return
    setNotesLoading(true)
    setNotesError(null)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('pinned_first', 'true')
    void fetch(getApiUrl(`notes?${params.toString()}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json() as Promise<NoteSummary[]>
      })
      .then(setNotes)
      .catch((err) => setNotesError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setNotesLoading(false))
  }, [route.tab, debouncedQuery, filters.searchScope])

  // Topics fetch.
  useEffect(() => {
    if (route.tab !== 'topics') return
    setTopicsLoading(true)
    setTopicsError(null)
    void fetch(getApiUrl('learning-topics'), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json() as Promise<LearningTopicListItem[]>
      })
      .then((list) => {
        const needle = debouncedQuery.trim().toLowerCase()
        const filtered = needle
          ? list.filter(
              (t) =>
                t.title.toLowerCase().includes(needle) ||
                (t.description ?? '').toLowerCase().includes(needle),
            )
          : list
        setTopics(filtered)
      })
      .catch((err) => setTopicsError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setTopicsLoading(false))
  }, [route.tab, debouncedQuery])

  // Unified search when scope === 'all'.
  useEffect(() => {
    if (filters.searchScope !== 'all') {
      setUnifiedResults([])
      setUnifiedLoading(false)
      setUnifiedError(null)
      return
    }
    if (route.tab === 'topics') return
    if (!debouncedQuery.trim()) {
      setUnifiedResults([])
      setUnifiedLoading(false)
      return
    }
    setUnifiedLoading(true)
    setUnifiedError(null)
    const params = new URLSearchParams()
    params.set('q', debouncedQuery.trim())
    params.set('search_mode', filters.searchMode)
    params.set('type', 'all')
    void fetch(getApiUrl(`search?${params.toString()}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json() as Promise<UnifiedSearchItem[]>
      })
      .then(setUnifiedResults)
      .catch((err) => setUnifiedError(err instanceof Error ? err.message : 'Search failed.'))
      .finally(() => setUnifiedLoading(false))
  }, [filters.searchScope, filters.searchMode, debouncedQuery, route.tab])

  const contextList = useMemo(() => {
    if (route.tab === 'conversations') {
      return conversations.slice(0, 30).map((c) => ({ id: c.id, label: c.title || 'Untitled' }))
    }
    if (route.tab === 'notes') {
      return notes.slice(0, 30).map((n) => ({ id: n.id, label: n.title || 'Untitled note' }))
    }
    return topics.slice(0, 30).map((t) => ({ id: t.id, label: t.title }))
  }, [route.tab, conversations, notes, topics])

  const showUnified = filters.searchScope === 'all' && debouncedQuery.trim().length > 0

  return (
    <>
      <ContextColumn title="Library" collapsed={ctxCollapsed} onToggleCollapsed={onToggleCtx}>
        <nav aria-label="Library tabs" className="mb-2 flex flex-col gap-0.5">
          {TABS.map((t) => {
            const active = route.tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors',
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-300 dark:hover:bg-gray-800',
                ].join(' ')}
              >
                {t.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Recent in {route.tab}
        </div>
        <ul className="flex flex-col">
          {contextList.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => selectItem(it.id)}
                className={[
                  'w-full truncate rounded px-2 py-1 text-left text-xs',
                  route.selectedId === it.id
                    ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
                    : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-200 dark:hover:bg-gray-800',
                ].join(' ')}
              >
                {it.label}
              </button>
            </li>
          ))}
          {contextList.length === 0 && (
            <li className="px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400">
              Nothing here yet.
            </li>
          )}
        </ul>
      </ContextColumn>

      <main className="flex flex-1 overflow-hidden">
        {/* Results panel */}
        <section className="flex w-[380px] flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800">
          <header className="flex-shrink-0 border-b border-gray-200 p-3 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 dark:border-gray-700 dark:bg-gray-900">
                <span className="h-3.5 w-3.5 text-gray-400">
                  <SearchIcon />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`Search ${route.tab}…`}
                  data-v2-search="library"
                  className="w-full bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
                />
              </div>
              <FilterDrawer
                filters={filters}
                onChange={setFilters}
                allTags={allTags}
                showSort={route.tab === 'conversations'}
                showSearchMode={route.tab !== 'topics'}
                showSearchScope={route.tab !== 'topics'}
                showTags={route.tab === 'conversations'}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
              <span>
                {showUnified
                  ? `${unifiedResults.length} results across all content`
                  : route.tab === 'conversations'
                    ? `${conversations.length} conversations`
                    : route.tab === 'notes'
                      ? `${notes.length} notes`
                      : `${topics.length} topics`}
              </span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-3">
            {/* Unified (scope=all) */}
            {showUnified && (
              <div className="flex flex-col gap-2">
                {unifiedLoading && (
                  <div className="py-2 text-xs text-gray-500 dark:text-gray-400">Searching…</div>
                )}
                {unifiedError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{unifiedError}</div>
                )}
                {!unifiedLoading &&
                  unifiedResults.map((r) => (
                    <button
                      key={`${r.type}:${r.id}`}
                      type="button"
                      onClick={() => selectItem(r.id)}
                      className={[
                        'w-full rounded-lg border p-2.5 text-left transition-colors',
                        route.selectedId === r.id
                          ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-900/20'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800/50',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={[
                            'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                            r.type === 'conversation'
                              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
                          ].join(' ')}
                        >
                          {r.type}
                        </span>
                        <span className="truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                          {r.title}
                        </span>
                      </div>
                      {r.content_preview && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">
                          {r.content_preview}
                        </p>
                      )}
                    </button>
                  ))}
              </div>
            )}

            {/* Tab-scoped results */}
            {!showUnified && route.tab === 'conversations' && (
              <div className="flex flex-col gap-2">
                {convLoading && (
                  <div className="py-2 text-xs text-gray-500 dark:text-gray-400">Loading…</div>
                )}
                {convError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{convError}</div>
                )}
                {!convLoading && conversations.length === 0 && (
                  <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    No conversations match your filters.
                  </div>
                )}
                {conversations.map((c) => (
                  <ConversationResultCard
                    key={c.id}
                    item={c}
                    selected={route.selectedId === c.id}
                    onOpen={() => selectItem(c.id)}
                  />
                ))}
              </div>
            )}

            {!showUnified && route.tab === 'notes' && (
              <div className="flex flex-col gap-2">
                {notesLoading && (
                  <div className="py-2 text-xs text-gray-500 dark:text-gray-400">Loading…</div>
                )}
                {notesError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{notesError}</div>
                )}
                {!notesLoading && notes.length === 0 && (
                  <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    No notes yet.{' '}
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'notes' })}
                      className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
                    >
                      Create one →
                    </button>
                  </div>
                )}
                {notes.map((n) => (
                  <NoteResultCard
                    key={n.id}
                    item={n}
                    selected={route.selectedId === n.id}
                    onOpen={() => selectItem(n.id)}
                  />
                ))}
              </div>
            )}

            {!showUnified && route.tab === 'topics' && (
              <div className="flex flex-col gap-2">
                {topicsLoading && (
                  <div className="py-2 text-xs text-gray-500 dark:text-gray-400">Loading…</div>
                )}
                {topicsError && (
                  <div className="text-xs text-red-600 dark:text-red-400">{topicsError}</div>
                )}
                {!topicsLoading && topics.length === 0 && (
                  <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                    No learning topics yet.
                  </div>
                )}
                {topics.map((t) => (
                  <TopicResultCard
                    key={t.id}
                    item={t}
                    selected={route.selectedId === t.id}
                    onOpen={() => navigate({ name: 'topics', topicId: t.id })}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Detail pane */}
        <section className="flex-1 overflow-hidden">
          {!route.selectedId && (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div className="max-w-sm">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Select an item
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Pick a {route.tab.slice(0, -1)} on the left to view and manage it here without
                  leaving this page.
                </p>
              </div>
            </div>
          )}
          {route.selectedId && route.tab === 'conversations' && (
            <ConversationDetailPane
              key={route.selectedId}
              conversationId={route.selectedId}
              navigate={navigate}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['v2', 'recent-chats'] })
                navigate({ name: 'library', tab: 'conversations' })
              }}
            />
          )}
          {route.selectedId && route.tab === 'notes' && (
            <NoteDetailPane
              key={route.selectedId}
              noteId={route.selectedId}
              onChanged={(note: NoteDetail) => {
                setNotes((prev) =>
                  prev.map((n) =>
                    n.id === note.id
                      ? {
                          ...n,
                          title: note.title,
                          tags: note.tags,
                          is_pinned: note.is_pinned,
                          visibility: note.visibility,
                          content_preview: note.content.slice(0, 200),
                          updated_at: note.updated_at,
                        }
                      : n,
                  ),
                )
              }}
              onDeleted={(id) => {
                setNotes((prev) => prev.filter((n) => n.id !== id))
                navigate({ name: 'library', tab: 'notes' })
              }}
              onClose={() => navigate({ name: 'library', tab: 'notes' })}
            />
          )}
        </section>
      </main>
    </>
  )
}
