import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import type { ConversationSummary } from '../types/conversation'

type SortOption = 'recent' | 'oldest' | 'most_replayed'

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Most Recent',
  oldest: 'Oldest',
  most_replayed: 'Most Replayed',
}

const SORT_OPTIONS: SortOption[] = ['recent', 'oldest', 'most_replayed']

const SESSION_KEY = 'kb_library_sort'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

interface Props {
  onBack: () => void
  onOpenConversation: (id: string) => void
}

export function LibraryPage({ onBack, onOpenConversation }: Props) {
  const { user, logout, deleteAccount } = useAuth()

  const [query, setQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortOption>(
    () => (sessionStorage.getItem(SESSION_KEY) as SortOption | null) ?? 'recent',
  )
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  function handleSortChange(next: SortOption) {
    setSort(next)
    sessionStorage.setItem(SESSION_KEY, next)
  }

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    fetch('/api/conversations/tags', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.resolve([])))
      .then(setAllTags)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    selectedTags.forEach((t) => params.append('tags', t))
    params.set('sort', sort)

    fetch(`/api/conversations?${params.toString()}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`)
        return r.json() as Promise<ConversationSummary[]>
      })
      .then((data) => {
        setConversations(data)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load conversations.')
        setIsLoading(false)
      })
  }, [debouncedQuery, selectedTags, sort])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function clearAll() {
    setQuery('')
    setSelectedTags([])
  }

  async function confirmDelete() {
    if (!deleteTargetId) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/conversations/${deleteTargetId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      setConversations((prev) => prev.filter((c) => c.id !== deleteTargetId))
      // Refresh tag list — a deleted conversation may have removed some tags.
      fetch('/api/conversations/tags', { credentials: 'include' })
        .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.resolve([])))
        .then((tags) => {
          setAllTags(tags)
          setSelectedTags((prev) => prev.filter((t) => tags.includes(t)))
        })
        .catch(() => undefined)
      setDeleteTargetId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setIsDeleting(false)
    }
  }

  async function confirmDeleteAccount() {
    setIsDeletingAccount(true)
    setDeleteAccountError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : 'Account deletion failed.')
      setIsDeletingAccount(false)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const hasFilter = debouncedQuery.length > 0 || selectedTags.length > 0

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold">
              KB
            </div>
            <span className="font-semibold text-sm">Library</span>
          </div>
        </div>
        <div className="flex items-center gap-2 border-l border-gray-800 pl-3">
          <span className="text-sm text-gray-300">{user?.display_name}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
          <div className="w-px h-3 bg-gray-700" />
          <button
            onClick={() => { setShowDeleteAccount(true); setDeleteAccountError(null) }}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
          >
            Delete account
          </button>
        </div>
      </header>

      {/* Search + tag filter bar */}
      <div className="px-4 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Search input */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search by title or content…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors text-base leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort + tag filter row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort control */}
            <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg p-0.5">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSortChange(option)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    sort === option
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>

            {/* Tag filter chips */}
            {allTags.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-700" />
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-1"
                  >
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-gray-100">Delete conversation?</h2>
              <p className="text-sm text-gray-400">
                {(() => {
                  const c = conversations.find((c) => c.id === deleteTargetId)
                  return c
                    ? <>This will permanently delete <span className="text-gray-200 font-medium">"{c.title}"</span> and all its messages.</>
                    : 'This will permanently delete the conversation and all its messages.'
                })()}
              </p>
            </div>
            {deleteError && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeleteTargetId(null); setDeleteError(null) }}
                disabled={isDeleting}
                className="px-4 py-2 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void confirmDelete() }}
                disabled={isDeleting}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting && <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirmation modal */}
      {showDeleteAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-gray-100">Delete your account?</h2>
              <p className="text-sm text-gray-400">
                This will permanently delete your account and{' '}
                <span className="text-gray-200 font-medium">all your conversations, messages, and collections</span>.
                This action cannot be undone.
              </p>
            </div>
            {deleteAccountError && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {deleteAccountError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteAccount(false); setDeleteAccountError(null) }}
                disabled={isDeletingAccount}
                className="px-4 py-2 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { void confirmDeleteAccount() }}
                disabled={isDeletingAccount}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingAccount && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                )}
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
              {error}
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <p className="text-gray-500 text-sm">
                {hasFilter
                  ? 'No conversations match your search.'
                  : 'No saved conversations yet.'}
              </p>
              {hasFilter && (
                <button
                  onClick={clearAll}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-600 mb-2">
                {conversations.length} conversation
                {conversations.length !== 1 ? 's' : ''}
                {hasFilter ? ' found' : ''}
              </p>
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="relative group bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl transition-colors"
                >
                  <button
                    onClick={() => onOpenConversation(conv.id)}
                    className="w-full text-left px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3 pr-8">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-100 truncate group-hover:text-white transition-colors">
                          {conv.title}
                        </p>
                        {conv.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {conv.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-indigo-900/40 text-indigo-400 border border-indigo-900/60 px-1.5 py-0.5 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-500">{formatDate(conv.updated_at)}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                        </p>
                        {conv.replay_count > 0 && (
                          <p className="text-xs text-indigo-500 mt-0.5" title="Times replayed">
                            ▶ {conv.replay_count}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTargetId(conv.id) }}
                    aria-label="Delete conversation"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
