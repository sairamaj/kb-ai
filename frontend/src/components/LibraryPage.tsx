import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'
import type { CollectionSummary, CreateCollectionPayload, UpdateCollectionPayload } from '../types/collection'
import type { ConversationSummary } from '../types/conversation'

type LibraryView = 'conversations' | 'collections'
type SortOption = 'recent' | 'oldest' | 'most_replayed'
type SearchMode = 'keyword' | 'semantic'

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Most Recent',
  oldest: 'Oldest',
  most_replayed: 'Most Replayed',
}

const SORT_OPTIONS: SortOption[] = ['recent', 'oldest', 'most_replayed']

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  keyword: 'Keyword',
  semantic: 'Semantic',
}

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

  const [libraryView, setLibraryView] = useState<LibraryView>('conversations')

  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
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
  const [pinningConvId, setPinningConvId] = useState<string | null>(null)
  const [collectionAction, setCollectionAction] = useState<{ convId: string; collectionId: string } | null>(null)

  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [collectionsError, setCollectionsError] = useState<string | null>(null)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null)
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [createCollectionName, setCreateCollectionName] = useState('')
  const [createCollectionVisibility, setCreateCollectionVisibility] = useState<'public' | 'private'>('private')
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [createCollectionError, setCreateCollectionError] = useState<string | null>(null)
  const [collectionVisibilityUpdating, setCollectionVisibilityUpdating] = useState<string | null>(null)
  const [copiedCollectionId, setCopiedCollectionId] = useState<string | null>(null)
  const [exportingCollectionId, setExportingCollectionId] = useState<string | null>(null)

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
    params.set('search_mode', searchMode)
    selectedTags.forEach((t) => params.append('tags', t))
    if (selectedCollectionId) params.set('collection_id', selectedCollectionId)
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
  }, [debouncedQuery, searchMode, selectedTags, selectedCollectionId, sort])

  useEffect(() => {
    setCollectionsLoading(true)
    setCollectionsError(null)
    fetch('/api/collections', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load collections (${r.status})`)
        return r.json() as Promise<CollectionSummary[]>
      })
      .then((data) => {
        setCollections(data)
        setCollectionsLoading(false)
      })
      .catch((err: unknown) => {
        setCollectionsError(err instanceof Error ? err.message : 'Failed to load collections.')
        setCollectionsLoading(false)
      })
  }, [libraryView])

  async function submitCreateCollection() {
    const name = createCollectionName.trim()
    if (!name) {
      setCreateCollectionError('Name is required.')
      return
    }
    setIsCreatingCollection(true)
    setCreateCollectionError(null)
    try {
      const body: CreateCollectionPayload = { name, visibility: createCollectionVisibility }
      const res = await fetch('/api/collections', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = data?.detail
        const message = Array.isArray(detail)
          ? detail.map((e: { msg?: string }) => e.msg ?? '').filter(Boolean).join(', ') || `Failed (${res.status})`
          : (typeof detail === 'string' ? detail : null) ?? `Create failed (${res.status})`
        throw new Error(message)
      }
      const created = (await res.json()) as CollectionSummary
      setCollections((prev) => [created, ...prev])
      setShowCreateCollection(false)
      setCreateCollectionName('')
      setCreateCollectionVisibility('private')
    } catch (err) {
      setCreateCollectionError(err instanceof Error ? err.message : 'Create failed.')
    } finally {
      setIsCreatingCollection(false)
    }
  }

  async function updateCollectionVisibility(collectionId: string, visibility: 'public' | 'private') {
    setCollectionVisibilityUpdating(collectionId)
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility } as UpdateCollectionPayload),
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = (await res.json()) as CollectionSummary
      setCollections((prev) => prev.map((c) => (c.id === collectionId ? updated : c)))
    } finally {
      setCollectionVisibilityUpdating(null)
    }
  }

  function copyCollectionLink(collectionId: string) {
    const url = `${window.location.origin}/collections/public/${collectionId}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedCollectionId(collectionId)
      setTimeout(() => setCopiedCollectionId(null), 2000)
    })
  }

  async function exportCollection(collectionId: string, format: 'md' | 'zip', collectionName: string) {
    setExportingCollectionId(collectionId)
    try {
      const res = await fetch(`/api/collections/${collectionId}/export?format=${format}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="?([^";\n]+)"?/)
      const ext = format === 'zip' ? '.zip' : '.md'
      const safeName = collectionName.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)
      const filename = match ? match[1].trim() : `${safeName}${ext}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setCollectionsError('Export failed.')
    } finally {
      setExportingCollectionId(null)
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function clearAll() {
    setQuery('')
    setSelectedTags([])
    setSelectedCollectionId(null)
  }

  async function addConversationToCollection(convId: string, collectionId: string) {
    setCollectionAction({ convId, collectionId })
    try {
      const res = await fetch(`/api/collections/${collectionId}/conversations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId }),
      })
      if (!res.ok) throw new Error('Failed to add')
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, collection_ids: [...(c.collection_ids ?? []), collectionId] } : c,
        ),
      )
    } finally {
      setCollectionAction(null)
    }
  }

  async function togglePin(convId: string) {
    const conv = conversations.find((c) => c.id === convId)
    if (!conv) return
    setPinningConvId(convId)
    try {
      const res = await fetch(`/api/conversations/${convId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: !conv.is_pinned } as { is_pinned: boolean }),
      })
      if (!res.ok) throw new Error('Failed to update pin')
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, is_pinned: !c.is_pinned } : c)),
      )
    } finally {
      setPinningConvId(null)
    }
  }

  async function removeConversationFromCollection(convId: string, collectionId: string) {
    setCollectionAction({ convId, collectionId })
    try {
      const res = await fetch(`/api/collections/${collectionId}/conversations/${convId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to remove')
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, collection_ids: (c.collection_ids ?? []).filter((id) => id !== collectionId) } : c,
        ),
      )
    } finally {
      setCollectionAction(null)
    }
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

  const hasFilter = debouncedQuery.length > 0 || selectedTags.length > 0 || selectedCollectionId !== null

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
              KB
            </div>
            <span className="font-semibold text-sm">Library</span>
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
          <div className="w-px h-3 bg-gray-300 dark:bg-gray-700" />
          <button
            onClick={() => { setShowDeleteAccount(true); setDeleteAccountError(null) }}
            className="text-xs text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Delete account
          </button>
        </div>
      </header>

      {/* Sidebar + main content */}
      <div className="flex flex-1 min-h-0">
        {/* Library sidebar */}
        <nav className="w-44 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col py-3">
          <button
            onClick={() => setLibraryView('conversations')}
            className={`text-left px-4 py-2.5 text-sm font-medium transition-colors ${
              libraryView === 'conversations'
                ? 'bg-indigo-50 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-r-2 border-indigo-500'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
            }`}
          >
            Conversations
          </button>
          <button
            onClick={() => setLibraryView('collections')}
            className={`text-left px-4 py-2.5 text-sm font-medium transition-colors ${
              libraryView === 'collections'
                ? 'bg-indigo-50 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-r-2 border-indigo-500'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
            }`}
          >
            Collections
          </button>
        </nav>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
      {/* Search + tag filter bar — only when viewing conversations */}
      {libraryView === 'conversations' && (
      <div className="px-4 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="max-w-3xl mx-auto space-y-3">
          {/* Search input */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none"
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
              placeholder={searchMode === 'semantic' ? 'Search by meaning…' : 'Search by title or content…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors text-base leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search mode: Keyword vs Semantic */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Search:</span>
            <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-0.5">
              {(['keyword', 'semantic'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSearchMode(mode)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    searchMode === mode
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {SEARCH_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Sort + tag filter row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort control */}
            <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-0.5">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSortChange(option)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    sort === option
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                  }`}
                >
                  {SORT_LABELS[option]}
                </button>
              ))}
            </div>

            {/* Collection filter */}
            {collections.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
                <select
                  value={selectedCollectionId ?? ''}
                  onChange={(e) => setSelectedCollectionId(e.target.value || null)}
                  className="text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All collections</option>
                  {collections.map((col) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Tag filter chips */}
            {allTags.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-1"
                  >
                    Clear filters
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete conversation?</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {(() => {
                  const c = conversations.find((c) => c.id === deleteTargetId)
                  return c
                    ? <>This will permanently delete <span className="text-gray-800 dark:text-gray-200 font-medium">"{c.title}"</span> and all its messages.</>
                    : 'This will permanently delete the conversation and all its messages.'
                })()}
              </p>
            </div>
            {deleteError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeleteTargetId(null); setDeleteError(null) }}
                disabled={isDeleting}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
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
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete your account?</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This will permanently delete your account and{' '}
                <span className="text-gray-800 dark:text-gray-200 font-medium">all your conversations, messages, and collections</span>.
                This action cannot be undone.
              </p>
            </div>
            {deleteAccountError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {deleteAccountError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowDeleteAccount(false); setDeleteAccountError(null) }}
                disabled={isDeletingAccount}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
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
      {libraryView === 'conversations' && (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
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
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-2">
                {conversations.length} conversation
                {conversations.length !== 1 ? 's' : ''}
                {hasFilter ? ' found' : ''}
              </p>
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className="relative group bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 rounded-xl transition-colors"
                >
                  <button
                    onClick={() => onOpenConversation(conv.id)}
                    className="w-full text-left px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3 pr-16">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-black dark:group-hover:text-white transition-colors">
                          {conv.title}
                        </p>
                        {conv.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {conv.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 px-1.5 py-0.5 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-gray-500">{formatDate(conv.updated_at)}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                          {conv.message_count} msg{conv.message_count !== 1 ? 's' : ''}
                        </p>
                        {conv.similarity != null && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5" title="Similarity score">
                            {Math.round(conv.similarity * 100)}% match
                          </p>
                        )}
                        {conv.replay_count > 0 && (
                          <p className="text-xs text-indigo-600 dark:text-indigo-500 mt-0.5" title="Times replayed">
                            ▶ {conv.replay_count}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                  {/* Collections: chips + add dropdown */}
                  <div
                    className="px-4 pb-3 flex flex-wrap items-center gap-2 border-t border-gray-200/80 dark:border-gray-800/80 mt-0 pt-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(conv.collection_ids ?? []).map((colId) => {
                      const col = collections.find((c) => c.id === colId)
                      const isRemoving = collectionAction?.convId === conv.id && collectionAction?.collectionId === colId
                      return (
                        <span
                          key={colId}
                          className="inline-flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 rounded-full pl-2 pr-1 py-0.5"
                        >
                          {col?.name ?? colId.slice(0, 8)}
                          <button
                            type="button"
                            onClick={() => { void removeConversationFromCollection(conv.id, colId) }}
                            disabled={!!collectionAction}
                            aria-label={`Remove from ${col?.name ?? 'collection'}`}
                            className="p-0.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-800/50 disabled:opacity-50"
                          >
                            {isRemoving ? (
                              <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin inline-block" />
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">×</span>
                            )}
                          </button>
                        </span>
                      )
                    })}
                    {collections.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const colId = e.target.value
                          if (colId) void addConversationToCollection(conv.id, colId)
                          e.target.value = ''
                        }}
                        disabled={!!collectionAction}
                        className="text-xs bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                      >
                        <option value="">Add to collection…</option>
                        {collections
                          .filter((c) => !(conv.collection_ids ?? []).includes(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); void togglePin(conv.id) }}
                    disabled={pinningConvId === conv.id}
                    aria-label={conv.is_pinned ? 'Unpin' : 'Pin'}
                    title={conv.is_pinned ? 'Unpin' : 'Pin to top'}
                    className="absolute top-3 right-9 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all disabled:opacity-50"
                  >
                    {pinningConvId === conv.id ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin block" />
                    ) : conv.is_pinned ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTargetId(conv.id) }}
                    aria-label="Delete conversation"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
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
      )}

      {/* Collections view */}
      {libraryView === 'collections' && (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Collections</h2>
            <button
              onClick={() => {
                setShowCreateCollection(true)
                setCreateCollectionError(null)
                setCreateCollectionName('')
                setCreateCollectionVisibility('private')
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              New collection
            </button>
          </div>
          {collectionsLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : collectionsError ? (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              {collectionsError}
            </div>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <p className="text-gray-500 text-sm">No collections yet.</p>
              <p className="text-xs text-gray-400 dark:text-gray-600">Create one to group related conversations.</p>
              <button
                onClick={() => {
                  setShowCreateCollection(true)
                  setCreateCollectionError(null)
                  setCreateCollectionName('')
                  setCreateCollectionVisibility('private')
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
              >
                New collection
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-2">
                {collections.length} collection{collections.length !== 1 ? 's' : ''}
              </p>
              {collections.map((col) => (
                <div
                  key={col.id}
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{col.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          void updateCollectionVisibility(col.id, col.visibility === 'public' ? 'private' : 'public')
                        }
                        disabled={collectionVisibilityUpdating === col.id}
                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                          col.visibility === 'public'
                            ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-400'
                        } disabled:opacity-50`}
                        title={col.visibility === 'public' ? 'Click to make private' : 'Click to make public'}
                      >
                        {collectionVisibilityUpdating === col.id ? '…' : col.visibility}
                      </button>
                      <span className="text-xs text-gray-400 dark:text-gray-600">
                        Created {formatDate(col.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => void exportCollection(col.id, 'md', col.name)}
                      disabled={exportingCollectionId === col.id}
                      className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Export collection as single Markdown file"
                    >
                      {exportingCollectionId === col.id ? (
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          MD
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportCollection(col.id, 'zip', col.name)}
                      disabled={exportingCollectionId === col.id}
                      className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      title="Export collection as ZIP of Markdown files"
                    >
                      ZIP
                    </button>
                    {col.visibility === 'public' && (
                      <button
                        type="button"
                        onClick={() => copyCollectionLink(col.id)}
                        className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1.5"
                        title="Copy shareable link"
                      >
                        {copiedCollectionId === col.id ? (
                          <span className="text-green-600 dark:text-green-400">Copied!</span>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy link
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Create collection modal */}
      {showCreateCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New collection</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Give your collection a name and choose visibility.</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="collection-name" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Name
                </label>
                <input
                  id="collection-name"
                  type="text"
                  value={createCollectionName}
                  onChange={(e) => setCreateCollectionName(e.target.value)}
                  placeholder="e.g. Python Tips"
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Visibility</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateCollectionVisibility('private')}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${
                      createCollectionVisibility === 'private'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateCollectionVisibility('public')}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${
                      createCollectionVisibility === 'public'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    Public
                  </button>
                </div>
              </div>
            </div>
            {createCollectionError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {createCollectionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateCollection(false)
                  setCreateCollectionError(null)
                }}
                disabled={isCreatingCollection}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void submitCreateCollection()}
                disabled={isCreatingCollection}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isCreatingCollection && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                )}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}
