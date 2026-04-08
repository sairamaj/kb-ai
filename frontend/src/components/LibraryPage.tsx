import { useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { USER_ROLE_LABELS } from '../types/auth'
import { ThemeToggle } from './ThemeToggle'
import { TopicReplayMode } from './TopicReplayMode'
import { UsageDisplay } from './UsageDisplay'
import { NoteEditor } from './NoteEditor'
import type { CollectionSummary, CreateCollectionPayload, UpdateCollectionPayload } from '../types/collection'
import type { ConversationSummary } from '../types/conversation'
import type { NoteDetail, NoteSummary } from '../types/note'
import type { UnifiedSearchItem, UnifiedSearchTypeFilter } from '../types/search'
import type {
  CreateLearningTopicPayload,
  LearningTopicDetail,
  LearningTopicItem,
  LearningTopicListItem,
  ReorderLearningTopicItemsPayload,
  UpdateLearningTopicPayload,
} from '../types/learningTopic'
import { getApiUrl } from '../api/base'
import { parseJsonSafe, userFacingApiError } from '../api/errors'
import { SHOW_COLLECTIONS_IN_UI } from '../config/features'

type LibraryView = 'conversations' | 'notes' | 'collections' | 'learning-topics'
type SortOption = 'recent' | 'oldest' | 'most_replayed'
type SearchMode = 'keyword' | 'semantic'
/** ENH-06: tab-only vs unified /search across conversations + notes */
type SearchScope = 'tab' | 'all'

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
/** TOPIC-08: persist library tab + open topic across refresh and when returning from a conversation. */
const SESSION_LIBRARY_VIEW = 'kb_library_view'
const SESSION_LEARNING_TOPIC_ID = 'kb_learning_topic_id'
const TOPIC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function learningTopicItemKey(item: LearningTopicItem): string {
  return item.type === 'conversation' ? `c:${item.conversation_id}` : `n:${item.note_id}`
}

function topicItemsOrLegacy(detail: LearningTopicDetail): LearningTopicItem[] {
  if (detail.items != null && detail.items.length > 0) return detail.items
  return detail.conversations.map((c) => ({
    type: 'conversation' as const,
    conversation_id: c.conversation_id,
    position: c.position,
    title: c.title,
    model: c.model,
    tags: c.tags,
    replay_count: c.replay_count,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }))
}

function readStoredLearningTopicId(): string | null {
  try {
    const t = sessionStorage.getItem(SESSION_LEARNING_TOPIC_ID)
    return t && TOPIC_UUID_RE.test(t) ? t : null
  } catch {
    return null
  }
}

function readInitialLibraryView(): LibraryView {
  try {
    if (readStoredLearningTopicId()) return 'learning-topics'
    const v = sessionStorage.getItem(SESSION_LIBRARY_VIEW) as LibraryView | null
    if (v === 'collections' && !SHOW_COLLECTIONS_IN_UI) return 'conversations'
    if (v === 'conversations' || v === 'notes' || v === 'collections' || v === 'learning-topics') return v
  } catch {
    /* ignore */
  }
  return 'conversations'
}

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
  /** REP-02: Only set for administrators; shows Reports nav link. */
  onOpenReports?: () => void
}

export function LibraryPage({ onBack, onOpenConversation, onOpenReports }: Props) {
  const queryClient = useQueryClient()
  const { user, logout, deleteAccount } = useAuth()

  const learningTopicsAtLimit =
    user?.usage != null &&
    user.usage.learning_topics_limit !== null &&
    user.usage.learning_topics_used >= user.usage.learning_topics_limit

  const [libraryView, setLibraryView] = useState<LibraryView>(readInitialLibraryView)

  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('keyword')
  const [searchScope, setSearchScope] = useState<SearchScope>('tab')
  const [unifiedTypeFilter, setUnifiedTypeFilter] = useState<UnifiedSearchTypeFilter>('all')
  const [unifiedResults, setUnifiedResults] = useState<UnifiedSearchItem[]>([])
  const [unifiedLoading, setUnifiedLoading] = useState(false)
  const [unifiedError, setUnifiedError] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
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

  const [learningTopics, setLearningTopics] = useState<LearningTopicListItem[]>([])
  const [learningTopicsLoading, setLearningTopicsLoading] = useState(false)
  const [learningTopicsError, setLearningTopicsError] = useState<string | null>(null)
  const [showCreateTopic, setShowCreateTopic] = useState(false)
  const [createTopicTitle, setCreateTopicTitle] = useState('')
  const [createTopicDescription, setCreateTopicDescription] = useState('')
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)
  const [createTopicError, setCreateTopicError] = useState<string | null>(null)
  const [createTopicVisibility, setCreateTopicVisibility] = useState<'public' | 'private'>('private')
  const [topicVisibilityUpdating, setTopicVisibilityUpdating] = useState<string | null>(null)
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null)
  const [deleteTopicId, setDeleteTopicId] = useState<string | null>(null)
  const [isDeletingTopic, setIsDeletingTopic] = useState(false)
  const [deleteTopicError, setDeleteTopicError] = useState<string | null>(null)

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(readStoredLearningTopicId)
  const [topicDetail, setTopicDetail] = useState<LearningTopicDetail | null>(null)
  const [topicDetailLoading, setTopicDetailLoading] = useState(false)
  const [topicDetailError, setTopicDetailError] = useState<string | null>(null)
  const [showAddTopicConvModal, setShowAddTopicConvModal] = useState(false)
  const [topicAddModalTab, setTopicAddModalTab] = useState<'conversations' | 'notes'>('conversations')
  const [notesForTopicModal, setNotesForTopicModal] = useState<NoteSummary[]>([])
  const [notesForTopicModalLoading, setNotesForTopicModalLoading] = useState(false)
  const [addTopicConvError, setAddTopicConvError] = useState<string | null>(null)
  const [addingTopicConvId, setAddingTopicConvId] = useState<string | null>(null)
  const [addingTopicNoteId, setAddingTopicNoteId] = useState<string | null>(null)
  const [removingTopicConvId, setRemovingTopicConvId] = useState<string | null>(null)
  const [removingTopicNoteId, setRemovingTopicNoteId] = useState<string | null>(null)
  const [removeTopicConvError, setRemoveTopicConvError] = useState<string | null>(null)
  const [reorderingTopicConvs, setReorderingTopicConvs] = useState(false)
  const [reorderTopicConvError, setReorderTopicConvError] = useState<string | null>(null)
  const [draggingTopicItemKey, setDraggingTopicItemKey] = useState<string | null>(null)
  const [showTopicReplay, setShowTopicReplay] = useState(false)

  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  function handleSortChange(next: SortOption) {
    setSort(next)
    sessionStorage.setItem(SESSION_KEY, next)
  }

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    fetch(getApiUrl('conversations/tags'), { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.resolve([])))
      .then(setAllTags)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (searchScope === 'all') return
    setIsLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('search_mode', searchMode)
    selectedTags.forEach((t) => params.append('tags', t))
    if (SHOW_COLLECTIONS_IN_UI && selectedCollectionId) params.set('collection_id', selectedCollectionId)
    params.set('sort', sort)

    fetch(getApiUrl(`conversations?${params.toString()}`), { credentials: 'include' })
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
  }, [debouncedQuery, searchMode, selectedTags, selectedCollectionId, sort, searchScope])

  useEffect(() => {
    if (libraryView !== 'notes') return
    if (searchScope === 'all') return
    setNotesLoading(true)
    setNotesError(null)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('pinned_first', 'true')

    fetch(getApiUrl(`notes?${params.toString()}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load notes (${r.status})`)
        return r.json() as Promise<NoteSummary[]>
      })
      .then((data) => {
        setNotes(data)
        setNotesLoading(false)
      })
      .catch((err: unknown) => {
        setNotesError(err instanceof Error ? err.message : 'Failed to load notes.')
        setNotesLoading(false)
      })
  }, [libraryView, debouncedQuery, searchScope])

  useEffect(() => {
    if (searchScope !== 'all') return
    if (libraryView !== 'conversations' && libraryView !== 'notes') return
    if (!debouncedQuery.trim()) {
      setUnifiedResults([])
      setUnifiedLoading(false)
      setUnifiedError(null)
      return
    }
    setUnifiedLoading(true)
    setUnifiedError(null)
    const params = new URLSearchParams()
    params.set('q', debouncedQuery.trim())
    params.set('search_mode', searchMode)
    params.set('type', unifiedTypeFilter)
    fetch(getApiUrl(`search?${params.toString()}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Search failed (${r.status})`)
        return r.json() as Promise<UnifiedSearchItem[]>
      })
      .then((data) => {
        setUnifiedResults(data)
        setUnifiedLoading(false)
      })
      .catch((err: unknown) => {
        setUnifiedError(err instanceof Error ? err.message : 'Search failed.')
        setUnifiedLoading(false)
      })
  }, [searchScope, libraryView, debouncedQuery, searchMode, unifiedTypeFilter])

  useEffect(() => {
    if (!SHOW_COLLECTIONS_IN_UI) {
      setCollections([])
      setCollectionsLoading(false)
      setCollectionsError(null)
      return
    }
    setCollectionsLoading(true)
    setCollectionsError(null)
    fetch(getApiUrl('collections'), { credentials: 'include' })
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

  useEffect(() => {
    if (!SHOW_COLLECTIONS_IN_UI && libraryView === 'collections') {
      setLibraryView('conversations')
    }
  }, [libraryView])

  const loadLearningTopicsList = useCallback(() => {
    setLearningTopicsLoading(true)
    setLearningTopicsError(null)
    return fetch(getApiUrl('learning-topics'), { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const body = await parseJsonSafe(r)
          throw new Error(
            userFacingApiError(r.status, body, {
              notFound: "We couldn't load your learning topics.",
            }),
          )
        }
        return r.json() as Promise<LearningTopicListItem[]>
      })
      .then((data) => {
        setLearningTopics(data)
        setLearningTopicsLoading(false)
      })
      .catch((err: unknown) => {
        setLearningTopicsError(err instanceof Error ? err.message : "Couldn't load learning topics.")
        setLearningTopicsLoading(false)
      })
  }, [])

  useEffect(() => {
    if (libraryView !== 'learning-topics') return
    void loadLearningTopicsList()
  }, [libraryView, loadLearningTopicsList])

  useEffect(() => {
    if (!showAddTopicConvModal) return
    setTopicAddModalTab('conversations')
    setNotesForTopicModalLoading(true)
    fetch(getApiUrl('notes?pinned_first=true'), { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<NoteSummary[]>) : Promise.resolve([])))
      .then(setNotesForTopicModal)
      .catch(() => setNotesForTopicModal([]))
      .finally(() => setNotesForTopicModalLoading(false))
  }, [showAddTopicConvModal])

  function closeTopicDetail() {
    try {
      sessionStorage.removeItem(SESSION_LEARNING_TOPIC_ID)
    } catch {
      /* ignore */
    }
    setSelectedTopicId(null)
    setTopicDetail(null)
    setTopicDetailError(null)
    setShowAddTopicConvModal(false)
    setAddTopicConvError(null)
    setRemovingTopicConvId(null)
    setRemoveTopicConvError(null)
    setReorderingTopicConvs(false)
    setReorderTopicConvError(null)
    setDraggingTopicItemKey(null)
    setShowTopicReplay(false)
  }

  async function loadTopicDetail(topicId: string) {
    setTopicDetailLoading(true)
    setTopicDetailError(null)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${topicId}`), { credentials: 'include' })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        if (res.status === 404) {
          try {
            sessionStorage.removeItem(SESSION_LEARNING_TOPIC_ID)
          } catch {
            /* ignore */
          }
          setSelectedTopicId(null)
        }
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "This topic isn't available. It may have been deleted.",
            forbidden: "You can't open this topic.",
          }),
        )
      }
      const data = (await res.json()) as LearningTopicDetail
      setTopicDetail(data)
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === topicId
            ? {
                ...t,
                visibility: data.visibility,
                conversation_count: data.conversations.length,
                updated_at: data.updated_at,
              }
            : t,
        ),
      )
    } catch (err) {
      setTopicDetailError(err instanceof Error ? err.message : 'Failed to load topic.')
    } finally {
      setTopicDetailLoading(false)
    }
  }

  function openTopicDetail(topicId: string) {
    try {
      sessionStorage.setItem(SESSION_LEARNING_TOPIC_ID, topicId)
    } catch {
      /* ignore */
    }
    setSelectedTopicId(topicId)
    setTopicDetail(null)
    setShowTopicReplay(false)
    void loadTopicDetail(topicId)
  }

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_LIBRARY_VIEW, libraryView)
    } catch {
      /* ignore */
    }
  }, [libraryView])

  useEffect(() => {
    if (libraryView !== 'learning-topics') {
      closeTopicDetail()
    }
  }, [libraryView])

  useEffect(() => {
    const id = readStoredLearningTopicId()
    if (!id) return
    if (libraryView !== 'learning-topics') return
    void loadTopicDetail(id)
    // Restore topic detail once after refresh / remount (TOPIC-08).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitAddConversationToTopic(conversationId: string) {
    if (!selectedTopicId) return
    setAddingTopicConvId(conversationId)
    setAddTopicConvError(null)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${selectedTopicId}/conversations`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "That conversation wasn't found.",
            conflict: 'That conversation is already in this topic.',
            forbidden: "You can't add that conversation.",
          }),
        )
      }
      const data = (await res.json()) as LearningTopicDetail
      setTopicDetail(data)
      setReorderTopicConvError(null)
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopicId
            ? {
                ...t,
                conversation_count: data.conversations.length,
                updated_at: data.updated_at,
              }
            : t,
        ),
      )
      setShowAddTopicConvModal(false)
    } catch (err) {
      setAddTopicConvError(err instanceof Error ? err.message : 'Add failed.')
    } finally {
      setAddingTopicConvId(null)
    }
  }

  async function submitRemoveConversationFromTopic(conversationId: string) {
    if (!selectedTopicId) return
    setRemovingTopicConvId(conversationId)
    setRemoveTopicConvError(null)
    try {
      const res = await fetch(
        getApiUrl(`learning-topics/${selectedTopicId}/conversations/${conversationId}`),
        { method: 'DELETE', credentials: 'include' },
      )
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "That conversation isn't in this topic.",
            forbidden: "You can't remove that conversation.",
          }),
        )
      }
      const data = (await res.json()) as LearningTopicDetail
      setTopicDetail(data)
      setRemoveTopicConvError(null)
      setReorderTopicConvError(null)
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopicId
            ? {
                ...t,
                conversation_count: data.conversations.length,
                updated_at: data.updated_at,
              }
            : t,
        ),
      )
    } catch (err) {
      setRemoveTopicConvError(err instanceof Error ? err.message : 'Remove failed.')
    } finally {
      setRemovingTopicConvId(null)
    }
  }

  async function submitAddNoteToTopic(noteId: string) {
    if (!selectedTopicId) return
    setAddingTopicNoteId(noteId)
    setAddTopicConvError(null)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${selectedTopicId}/notes`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId }),
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "That note wasn't found.",
            conflict: 'That note is already in this topic.',
            forbidden: "You can't add that note.",
          }),
        )
      }
      const data = (await res.json()) as LearningTopicDetail
      setTopicDetail(data)
      setReorderTopicConvError(null)
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopicId
            ? {
                ...t,
                conversation_count: data.conversations.length,
                updated_at: data.updated_at,
              }
            : t,
        ),
      )
      setShowAddTopicConvModal(false)
    } catch (err) {
      setAddTopicConvError(err instanceof Error ? err.message : 'Add failed.')
    } finally {
      setAddingTopicNoteId(null)
    }
  }

  async function submitRemoveNoteFromTopic(noteId: string) {
    if (!selectedTopicId) return
    setRemovingTopicNoteId(noteId)
    setRemoveTopicConvError(null)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${selectedTopicId}/notes/${noteId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "That note isn't in this topic.",
            forbidden: "You can't remove that note.",
          }),
        )
      }
      const data = (await res.json()) as LearningTopicDetail
      setTopicDetail(data)
      setRemoveTopicConvError(null)
      setReorderTopicConvError(null)
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopicId
            ? {
                ...t,
                conversation_count: data.conversations.length,
                updated_at: data.updated_at,
              }
            : t,
        ),
      )
    } catch (err) {
      setRemoveTopicConvError(err instanceof Error ? err.message : 'Remove failed.')
    } finally {
      setRemovingTopicNoteId(null)
    }
  }

  async function submitUnifiedTopicReorder(orderedItems: LearningTopicItem[]) {
    if (!selectedTopicId) return
    setReorderingTopicConvs(true)
    setReorderTopicConvError(null)
    try {
      const body: ReorderLearningTopicItemsPayload = {
        items: orderedItems.map((it) =>
          it.type === 'conversation'
            ? { type: 'conversation', id: it.conversation_id }
            : { type: 'note', id: it.note_id },
        ),
      }
      const res = await fetch(getApiUrl(`learning-topics/${selectedTopicId}/reorder`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "This topic wasn't found.",
            forbidden: "You can't update the order.",
          }),
        )
      }
      const data = (await res.json()) as LearningTopicDetail
      setTopicDetail(data)
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === selectedTopicId
            ? {
                ...t,
                updated_at: data.updated_at,
              }
            : t,
        ),
      )
    } catch (err) {
      setReorderTopicConvError(err instanceof Error ? err.message : 'Reorder failed.')
    } finally {
      setReorderingTopicConvs(false)
    }
  }

  function moveTopicItem(fromIndex: number, toIndex: number) {
    if (!topicDetail || reorderingTopicConvs || removingTopicConvId || removingTopicNoteId) return
    const items = topicItemsOrLegacy(topicDetail)
    const n = items.length
    if (fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n || fromIndex === toIndex) return
    const next = [...items]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    void submitUnifiedTopicReorder(next)
  }

  function handleTopicItemDragStart(e: DragEvent, item: LearningTopicItem) {
    if (reorderingTopicConvs || removingTopicConvId || removingTopicNoteId) {
      e.preventDefault()
      return
    }
    const key = learningTopicItemKey(item)
    setDraggingTopicItemKey(key)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
  }

  function handleTopicItemDragOver(e: DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleTopicItemDrop(e: DragEvent, targetItem: LearningTopicItem) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain') || draggingTopicItemKey
    setDraggingTopicItemKey(null)
    if (!topicDetail || !raw) return
    const targetKey = learningTopicItemKey(targetItem)
    if (raw === targetKey) return
    const items = topicItemsOrLegacy(topicDetail)
    const orderKeys = items.map(learningTopicItemKey)
    const from = orderKeys.indexOf(raw)
    if (from < 0) return
    const next = [...items]
    const [el] = next.splice(from, 1)
    const to = orderKeys.indexOf(targetKey)
    if (to < 0) return
    next.splice(to, 0, el)
    void submitUnifiedTopicReorder(next)
  }

  async function submitCreateTopic() {
    const title = createTopicTitle.trim()
    if (!title) {
      setCreateTopicError('Title is required.')
      return
    }
    setIsCreatingTopic(true)
    setCreateTopicError(null)
    try {
      const desc = createTopicDescription.trim()
      const body: CreateLearningTopicPayload = {
        title,
        visibility: createTopicVisibility,
        ...(desc ? { description: desc } : {}),
      }
      const res = await fetch(getApiUrl('learning-topics'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            forbidden: "You've reached your learning topic limit for your plan.",
          }),
        )
      }
      const created = (await res.json()) as LearningTopicListItem
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setLearningTopics((prev) => [created, ...prev])
      setShowCreateTopic(false)
      setCreateTopicTitle('')
      setCreateTopicDescription('')
      setCreateTopicVisibility('private')
      openTopicDetail(created.id)
    } catch (err) {
      setCreateTopicError(err instanceof Error ? err.message : 'Create failed.')
    } finally {
      setIsCreatingTopic(false)
    }
  }

  async function confirmDeleteTopic() {
    if (!deleteTopicId) return
    setIsDeletingTopic(true)
    setDeleteTopicError(null)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${deleteTopicId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await parseJsonSafe(res)
        throw new Error(
          userFacingApiError(res.status, data, {
            notFound: "That topic is no longer there.",
            forbidden: "You can't delete that topic.",
          }),
        )
      }
      if (selectedTopicId === deleteTopicId) {
        closeTopicDetail()
      }
      setLearningTopics((prev) => prev.filter((t) => t.id !== deleteTopicId))
      setDeleteTopicId(null)
    } catch (err) {
      setDeleteTopicError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setIsDeletingTopic(false)
    }
  }

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
      const res = await fetch(getApiUrl('collections'), {
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
      queryClient.invalidateQueries({ queryKey: ['me'] })
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
      const res = await fetch(getApiUrl(`collections/${collectionId}`), {
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

  async function updateLearningTopicVisibility(topicId: string, visibility: 'public' | 'private') {
    setTopicVisibilityUpdating(topicId)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${topicId}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility } satisfies UpdateLearningTopicPayload),
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = (await res.json()) as LearningTopicListItem
      setLearningTopics((prev) =>
        prev.map((t) =>
          t.id === topicId
            ? {
                ...t,
                visibility: updated.visibility,
                conversation_count: updated.conversation_count,
                updated_at: updated.updated_at,
              }
            : t,
        ),
      )
      setTopicDetail((d) => (d && d.id === topicId ? { ...d, visibility: updated.visibility } : d))
    } finally {
      setTopicVisibilityUpdating(null)
    }
  }

  function copyLearningTopicLink(topicId: string) {
    const url = `${window.location.origin}/learning-topics/public/${topicId}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedTopicId(topicId)
      setTimeout(() => setCopiedTopicId(null), 2000)
    })
  }

  async function exportCollection(collectionId: string, format: 'md' | 'zip', collectionName: string) {
    setExportingCollectionId(collectionId)
    try {
      const res = await fetch(getApiUrl(`collections/${collectionId}/export?format=${format}`), { credentials: 'include' })
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

  function openNewNoteEditor() {
    setActiveNoteId(null)
    setShowNoteEditor(true)
  }

  function openExistingNoteEditor(noteId: string) {
    setActiveNoteId(noteId)
    setShowNoteEditor(true)
  }

  function handleNoteSaved(note: NoteDetail, isNew: boolean) {
    const previewSource = note.content.replace(/\s+/g, ' ').trim()
    const summary: NoteSummary = {
      id: note.id,
      title: note.title,
      tags: note.tags ?? [],
      content_preview: previewSource.length > 150 ? `${previewSource.slice(0, 149)}…` : previewSource,
      visibility: note.visibility,
      is_pinned: note.is_pinned,
      updated_at: note.updated_at,
    }
    function sortNotes(items: NoteSummary[]) {
      return [...items].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
    }
    setNotes((prev) => {
      if (isNew || !prev.some((n) => n.id === note.id)) {
        return sortNotes([summary, ...prev])
      }
      return sortNotes(prev.map((n) => (n.id === note.id ? summary : n)))
    })
  }

  function handleNoteDeleted(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  async function addConversationToCollection(convId: string, collectionId: string) {
    setCollectionAction({ convId, collectionId })
    try {
      const res = await fetch(getApiUrl(`collections/${collectionId}/conversations`), {
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
      const res = await fetch(getApiUrl(`conversations/${convId}`), {
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
      const res = await fetch(getApiUrl(`collections/${collectionId}/conversations/${convId}`), {
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
      const res = await fetch(getApiUrl(`conversations/${deleteTargetId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      setConversations((prev) => prev.filter((c) => c.id !== deleteTargetId))
      fetch(getApiUrl('conversations/tags'), { credentials: 'include' })
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

  function renderUnifiedSearchResults(): JSX.Element {
    return (
      <>
        {unifiedLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : unifiedError ? (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
            {unifiedError}
          </div>
        ) : !debouncedQuery.trim() ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-12 text-center">
            Type a search query to find conversations and notes in one list.
          </p>
        ) : unifiedResults.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-gray-500 text-sm">No matching conversations or notes.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-400 dark:text-gray-600 mb-2">
              {unifiedResults.length} result{unifiedResults.length !== 1 ? 's' : ''}
            </p>
            {unifiedResults.map((item) =>
              item.type === 'conversation' ? (
                <div
                  key={`c-${item.id}`}
                  className="relative group bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 rounded-xl transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenConversation(item.id)}
                    className="w-full text-left px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3 pr-16">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wide font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">
                          Conversation
                        </p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-black dark:group-hover:text-white transition-colors">
                          {item.title}
                        </p>
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {item.tags.map((tag) => (
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
                        <p className="text-xs text-gray-500">{formatDate(item.updated_at)}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                          {item.message_count ?? 0} msg{(item.message_count ?? 0) !== 1 ? 's' : ''}
                        </p>
                        {searchMode === 'semantic' && item.score != null && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5" title="Similarity score">
                            {Math.round(item.score * 100)}% match
                          </p>
                        )}
                        {(item.replay_count ?? 0) > 0 && (
                          <p className="text-xs text-indigo-600 dark:text-indigo-500 mt-0.5" title="Times replayed">
                            ▶ {item.replay_count}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void togglePin(item.id)
                    }}
                    disabled={pinningConvId === item.id}
                    aria-label={item.is_pinned ? 'Unpin' : 'Pin'}
                    title={item.is_pinned ? 'Unpin' : 'Pin to top'}
                    className="absolute top-3 right-9 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all disabled:opacity-50"
                  >
                    {pinningConvId === item.id ? (
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin block" />
                    ) : item.is_pinned ? (
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
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTargetId(item.id)
                    }}
                    aria-label="Delete conversation"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  key={`n-${item.id}`}
                  type="button"
                  onClick={() => openExistingNoteEditor(item.id)}
                  className="relative text-left w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 rounded-xl px-4 py-3.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-500 mb-0.5">
                        Note
                      </p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</p>
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 px-1.5 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.content_preview && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{item.content_preview}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">{formatDate(item.updated_at)}</p>
                      {searchMode === 'semantic' && item.score != null && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5" title="Similarity score">
                          {Math.round(item.score * 100)}% match
                        </p>
                      )}
                      {item.is_pinned && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Pinned</p>
                      )}
                    </div>
                  </div>
                </button>
              )
            )}
          </div>
        )}
      </>
    )
  }

  const hasFilter =
    debouncedQuery.length > 0 ||
    selectedTags.length > 0 ||
    (SHOW_COLLECTIONS_IN_UI && selectedCollectionId !== null)

  return (
    <>
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
          {onOpenReports && (
            <button
              onClick={onOpenReports}
              className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Reports
            </button>
          )}
          <ThemeToggle />
          {user?.usage && (
            <UsageDisplay usage={user.usage} className="hidden sm:inline" />
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {user?.display_name}
            {user?.role && (
              <span className="ml-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-normal">
                ({USER_ROLE_LABELS[user.role]})
              </span>
            )}
          </span>
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
          {SHOW_COLLECTIONS_IN_UI && (
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
          )}
          <button
            onClick={() => setLibraryView('notes')}
            className={`text-left px-4 py-2.5 text-sm font-medium transition-colors ${
              libraryView === 'notes'
                ? 'bg-indigo-50 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-r-2 border-indigo-500'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
            }`}
          >
            Notes
          </button>
          <button
            onClick={() => setLibraryView('learning-topics')}
            className={`text-left px-4 py-2.5 text-sm font-medium transition-colors ${
              libraryView === 'learning-topics'
                ? 'bg-indigo-50 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 border-r-2 border-indigo-500'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-800/50'
            }`}
          >
            Learning topics
          </button>
        </nav>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
      {/* Search + tag filter bar */}
      {(libraryView === 'conversations' || libraryView === 'notes') && (
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
              placeholder={
                searchScope === 'all'
                  ? searchMode === 'semantic'
                    ? 'Search conversations and notes by meaning…'
                    : 'Search conversations and notes by keyword…'
                  : libraryView === 'notes'
                    ? 'Search notes by title or content…'
                    : searchMode === 'semantic'
                      ? 'Search by meaning…'
                      : 'Search by title or content…'
              }
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

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Search in:</span>
            <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setSearchScope('tab')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  searchScope === 'tab'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                This tab
              </button>
              <button
                type="button"
                onClick={() => setSearchScope('all')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  searchScope === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                All
              </button>
            </div>
            {searchScope === 'all' && (
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span className="text-gray-500">Types</span>
                <select
                  value={unifiedTypeFilter}
                  onChange={(e) => setUnifiedTypeFilter(e.target.value as UnifiedSearchTypeFilter)}
                  className="text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">All</option>
                  <option value="conversation">Conversations</option>
                  <option value="note">Notes</option>
                </select>
              </label>
            )}
          </div>

          {(libraryView === 'conversations' || (libraryView === 'notes' && searchScope === 'all')) && (
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
          )}

          {libraryView === 'conversations' && searchScope !== 'all' && (
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
            {SHOW_COLLECTIONS_IN_UI && collections.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
                <select
                  value={selectedCollectionId ?? ''}
                  onChange={(e) => setSelectedCollectionId(e.target.value || null)}
                  className="text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">All collections</option>
                  {collections.filter((c) => c.is_owner !== false).map((col) => (
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
          )}
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

      {/* Delete learning topic confirmation modal */}
      {deleteTopicId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete learning topic?</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {(() => {
                  const t = learningTopics.find((x) => x.id === deleteTopicId)
                  return t ? (
                    <>
                      This removes{' '}
                      <span className="text-gray-800 dark:text-gray-200 font-medium">"{t.title}"</span> and any links
                      from this topic to conversations. Your conversations remain in the library.
                    </>
                  ) : (
                    'This removes the topic and its links to conversations. Your conversations are not deleted.'
                  )
                })()}
              </p>
            </div>
            {deleteTopicError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {deleteTopicError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteTopicId(null)
                  setDeleteTopicError(null)
                }}
                disabled={isDeletingTopic}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void confirmDeleteTopic() }}
                disabled={isDeletingTopic}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingTopic && (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                )}
                Delete topic
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
                <span className="text-gray-800 dark:text-gray-200 font-medium">
                  all your conversations, messages, learning topics, and other data tied to your account
                </span>
                . This action cannot be undone.
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
          {searchScope === 'all' ? (
            renderUnifiedSearchResults()
          ) : (
            <>
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
                  {SHOW_COLLECTIONS_IN_UI && (
                    <div
                      className="px-4 pb-3 flex flex-wrap items-center gap-2 border-t border-gray-200/80 dark:border-gray-800/80 mt-0 pt-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(conv.collection_ids ?? []).map((colId) => {
                        const col = collections.find((c) => c.id === colId)
                        const isRemoving =
                          collectionAction?.convId === conv.id && collectionAction?.collectionId === colId
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
                            .filter((c) => c.is_owner !== false && !(conv.collection_ids ?? []).includes(c.id))
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  )}
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
            </>
          )}
        </div>
      </div>
      )}

      {/* Collections view */}
      {SHOW_COLLECTIONS_IN_UI && libraryView === 'collections' && (
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
              {collections.map((col) => {
                const isOwned = col.is_owner !== false
                return (
                <div
                  key={col.id}
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{col.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {isOwned && (
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
                      )}
                      {!isOwned && col.author_name && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">by {col.author_name}</span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-600">
                        Created {formatDate(col.created_at)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOwned ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <a
                          href={`/collections/public/${col.id}`}
                          className="text-xs px-2 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
                        >
                          View
                        </a>
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
                      </>
                    )}
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Notes view */}
      {libraryView === 'notes' && (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notes</h2>
            <button
              type="button"
              onClick={openNewNoteEditor}
              className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
            >
              New note
            </button>
          </div>
          {searchScope === 'all' ? (
            renderUnifiedSearchResults()
          ) : notesLoading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : notesError ? (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
              {notesError}
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <p className="text-gray-500 text-sm">
                {debouncedQuery ? 'No notes match your search.' : 'No notes yet.'}
              </p>
              {!debouncedQuery && (
                <button
                  type="button"
                  onClick={openNewNoteEditor}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                >
                  New note
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400 dark:text-gray-600 mb-2">
                {notes.length} note{notes.length !== 1 ? 's' : ''}
              </p>
              {notes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => openExistingNoteEditor(note.id)}
                  className="relative text-left w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 rounded-xl px-4 py-3.5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{note.title}</p>
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {note.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/60 px-1.5 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">{note.content_preview}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">{formatDate(note.updated_at)}</p>
                      {note.is_pinned && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Pinned</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Learning topics view */}
      {libraryView === 'learning-topics' && (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {selectedTopicId ? (
            <>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => closeTopicDetail()}
                  className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  ← Topics
                </button>
              </div>
              {topicDetailLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                </div>
              ) : topicDetailError ? (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0">{topicDetailError}</p>
                  {selectedTopicId && (
                    <button
                      type="button"
                      onClick={() => void loadTopicDetail(selectedTopicId)}
                      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100/80 dark:hover:bg-red-950/40 transition-colors"
                    >
                      Try again
                    </button>
                  )}
                </div>
              ) : topicDetail ? (
                <div className="space-y-4">
                  <div className="relative group">
                    <div className="flex items-start justify-between gap-3 pr-10">
                      <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{topicDetail.title}</h2>
                        {topicDetail.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{topicDetail.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              void updateLearningTopicVisibility(
                                topicDetail.id,
                                topicDetail.visibility === 'public' ? 'private' : 'public',
                              )
                            }
                            disabled={topicVisibilityUpdating === topicDetail.id}
                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                              topicDetail.visibility === 'public'
                                ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-400'
                            } disabled:opacity-50`}
                            title={
                              topicDetail.visibility === 'public' ? 'Click to make private' : 'Click to make public'
                            }
                          >
                            {topicVisibilityUpdating === topicDetail.id ? '…' : topicDetail.visibility}
                          </button>
                          {topicDetail.visibility === 'public' && (
                            <button
                              type="button"
                              onClick={() => copyLearningTopicLink(topicDetail.id)}
                              className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Copy shareable link"
                            >
                              {copiedTopicId === topicDetail.id ? (
                                <span className="text-green-600 dark:text-green-400">Copied!</span>
                              ) : (
                                'Copy link'
                              )}
                            </button>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-600">
                            Updated {formatDate(topicDetail.updated_at)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTopicId(topicDetail.id)
                          setDeleteTopicError(null)
                        }}
                        aria-label="Delete learning topic"
                        className="absolute top-0 right-0 p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap sm:gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddTopicConvModal(true)
                          setAddTopicConvError(null)
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors w-fit"
                      >
                        Add to topic
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTopicReplay(true)}
                        disabled={topicItemsOrLegacy(topicDetail).length === 0}
                        className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors w-fit disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-50 dark:disabled:hover:bg-indigo-950/40"
                      >
                        Replay topic
                      </button>
                      {topicItemsOrLegacy(topicDetail).length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-2">
                          <span>Drag the handle or use arrows to set replay order.</span>
                          {reorderingTopicConvs && (
                            <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                              <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                              Saving…
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  {removeTopicConvError && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      {removeTopicConvError}
                    </p>
                  )}
                  {reorderTopicConvError && (
                    <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      {reorderTopicConvError}
                    </p>
                  )}
                  {topicItemsOrLegacy(topicDetail).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-8 text-center">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nothing in this topic yet</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
                        Use <span className="font-medium text-gray-700 dark:text-gray-300">Add to topic</span> to attach
                        saved conversations or notes. Replay runs through the full sequence in order.
                      </p>
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {topicItemsOrLegacy(topicDetail).map((row, idx) => {
                        const titems = topicItemsOrLegacy(topicDetail)
                        const rowKey = learningTopicItemKey(row)
                        return (
                        <li
                          key={rowKey}
                          onDragOver={handleTopicItemDragOver}
                          onDrop={(e) => handleTopicItemDrop(e, row)}
                          className={
                            draggingTopicItemKey === rowKey
                              ? 'opacity-70'
                              : undefined
                          }
                        >
                          <div className="flex items-stretch gap-2">
                            <button
                              type="button"
                              draggable={!reorderingTopicConvs && !removingTopicConvId && !removingTopicNoteId}
                              onDragStart={(e) => handleTopicItemDragStart(e, row)}
                              onDragEnd={() => setDraggingTopicItemKey(null)}
                              disabled={reorderingTopicConvs || !!removingTopicConvId || !!removingTopicNoteId}
                              title="Drag to reorder"
                              aria-label={`Drag to reorder: ${row.type === 'conversation' ? row.title : row.title}`}
                              className="shrink-0 w-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-500 cursor-grab active:cursor-grabbing hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M8 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm8-12a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </button>
                            {row.type === 'conversation' ? (
                            <button
                              type="button"
                              onClick={() => onOpenConversation(row.conversation_id)}
                              className="flex-1 min-w-0 text-left bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded px-1.5 py-0.5">
                                  Chat
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.title}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-400 dark:text-gray-600">
                                <span>{row.model}</span>
                                <span>·</span>
                                <span>Step {row.position + 1}</span>
                              </div>
                            </button>
                            ) : (
                            <div className="flex-1 min-w-0 text-left bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 rounded-xl px-4 py-3">
                              <div className="flex items-center gap-2 mb-1">
                                <svg className="w-4 h-4 text-amber-700 dark:text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5">
                                  Note
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.title}</p>
                              {row.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {row.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[10px] bg-amber-100/80 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-1.5 py-0.5 rounded-full"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 line-clamp-2">{row.content_preview}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Step {row.position + 1}</p>
                            </div>
                            )}
                            <div className="flex flex-col gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={
                                  reorderingTopicConvs ||
                                  !!removingTopicConvId ||
                                  !!removingTopicNoteId ||
                                  idx === 0
                                }
                                onClick={() => moveTopicItem(idx, idx - 1)}
                                title="Move up"
                                aria-label="Move up"
                                className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={
                                  reorderingTopicConvs ||
                                  !!removingTopicConvId ||
                                  !!removingTopicNoteId ||
                                  idx === titems.length - 1
                                }
                                onClick={() => moveTopicItem(idx, idx + 1)}
                                title="Move down"
                                aria-label="Move down"
                                className="px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                              >
                                ↓
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={
                                !!removingTopicConvId ||
                                !!removingTopicNoteId ||
                                reorderingTopicConvs
                              }
                              onClick={() =>
                                row.type === 'conversation'
                                  ? void submitRemoveConversationFromTopic(row.conversation_id)
                                  : void submitRemoveNoteFromTopic(row.note_id)
                              }
                              className="shrink-0 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                              aria-label="Remove from topic"
                            >
                              {(row.type === 'conversation' && removingTopicConvId === row.conversation_id) ||
                              (row.type === 'note' && removingTopicNoteId === row.note_id) ? (
                                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                              ) : (
                                'Remove'
                              )}
                            </button>
                          </div>
                        </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Learning topics</h2>
                <button
                  type="button"
                  disabled={learningTopicsAtLimit}
                  title={
                    learningTopicsAtLimit
                      ? 'Learning topic limit reached for your plan. Delete a topic or upgrade to create more.'
                      : undefined
                  }
                  onClick={() => {
                    setShowCreateTopic(true)
                    setCreateTopicError(null)
                    setCreateTopicTitle('')
                    setCreateTopicDescription('')
                    setCreateTopicVisibility('private')
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                >
                  New topic
                </button>
              </div>
              {learningTopicsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                </div>
              ) : learningTopicsError ? (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0">{learningTopicsError}</p>
                  <button
                    type="button"
                    onClick={() => void loadLearningTopicsList()}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100/80 dark:hover:bg-red-950/40 transition-colors"
                  >
                    Try again
                  </button>
                </div>
              ) : learningTopics.length === 0 ? (
                <div className="flex flex-col items-center py-16 gap-3">
                  <p className="text-gray-500 text-sm">No learning topics yet.</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 text-center max-w-sm">
                    Create a topic to organize related conversations for study and replay.
                  </p>
                  <button
                    type="button"
                    disabled={learningTopicsAtLimit}
                    title={
                      learningTopicsAtLimit
                        ? 'Learning topic limit reached for your plan. Delete a topic or upgrade to create more.'
                        : undefined
                    }
                    onClick={() => {
                      setShowCreateTopic(true)
                      setCreateTopicError(null)
                      setCreateTopicTitle('')
                      setCreateTopicDescription('')
                      setCreateTopicVisibility('private')
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                  >
                    New topic
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-400 dark:text-gray-600 mb-2">
                    {learningTopics.length} topic{learningTopics.length !== 1 ? 's' : ''}
                  </p>
                  {learningTopics.map((t) => {
                    const isOwned = t.is_owner !== false
                    return (
                    <div
                      key={t.id}
                      className="relative group bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3"
                    >
                      <div
                        role={isOwned ? 'button' : undefined}
                        tabIndex={isOwned ? 0 : undefined}
                        onClick={isOwned ? () => openTopicDetail(t.id) : undefined}
                        onKeyDown={
                          isOwned
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  openTopicDetail(t.id)
                                }
                              }
                            : undefined
                        }
                        className={`min-w-0 flex-1 ${isOwned ? 'cursor-pointer hover:opacity-90' : ''}`}
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.title}</p>
                        {t.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{t.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-gray-400 dark:text-gray-600">
                          {!isOwned && t.author_name && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">by {t.author_name}</span>
                          )}
                          <span>
                            {isOwned
                              ? `${t.conversation_count} conversation${t.conversation_count !== 1 ? 's' : ''}`
                              : `${t.conversation_count} public conversation${t.conversation_count !== 1 ? 's' : ''}`}
                          </span>
                          <span>·</span>
                          <span>Updated {formatDate(t.updated_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isOwned ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void updateLearningTopicVisibility(
                                  t.id,
                                  t.visibility === 'public' ? 'private' : 'public',
                                )
                              }
                              disabled={topicVisibilityUpdating === t.id}
                              className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                                t.visibility === 'public'
                                  ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-400'
                              } disabled:opacity-50`}
                              title={t.visibility === 'public' ? 'Click to make private' : 'Click to make public'}
                            >
                              {topicVisibilityUpdating === t.id ? '…' : t.visibility}
                            </button>
                            {t.visibility === 'public' && (
                              <button
                                type="button"
                                onClick={() => copyLearningTopicLink(t.id)}
                                className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1.5"
                                title="Copy shareable link"
                              >
                                {copiedTopicId === t.id ? (
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
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTopicId(t.id)
                                setDeleteTopicError(null)
                              }}
                              aria-label="Delete learning topic"
                              className="p-1.5 rounded-md text-gray-400 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          <>
                            <a
                              href={`/learning-topics/public/${t.id}`}
                              className="text-xs px-2 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
                            >
                              View
                            </a>
                            <button
                              type="button"
                              onClick={() => copyLearningTopicLink(t.id)}
                              className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1.5"
                              title="Copy shareable link"
                            >
                              {copiedTopicId === t.id ? (
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
                          </>
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {libraryView === 'learning-topics' && showTopicReplay && selectedTopicId && (
        <TopicReplayMode
          topicId={selectedTopicId}
          onExit={() => {
            setShowTopicReplay(false)
            void loadTopicDetail(selectedTopicId)
          }}
        />
      )}

      {/* Add conversations / notes to learning topic */}
      {libraryView === 'learning-topics' && showAddTopicConvModal && topicDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[min(80vh,32rem)] shadow-2xl flex flex-col gap-4">
            <div className="flex flex-col gap-1 shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add to topic</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add saved conversations or notes to &ldquo;{topicDetail.title}&rdquo;. New items are appended to the end of
                the topic order.
              </p>
            </div>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-50 dark:bg-gray-950 shrink-0">
              <button
                type="button"
                onClick={() => setTopicAddModalTab('conversations')}
                className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
                  topicAddModalTab === 'conversations'
                    ? 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Add conversation
              </button>
              <button
                type="button"
                onClick={() => setTopicAddModalTab('notes')}
                className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
                  topicAddModalTab === 'notes'
                    ? 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Add note
              </button>
            </div>
            {addTopicConvError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 shrink-0">
                {addTopicConvError}
              </p>
            )}
            <div className="overflow-y-auto flex-1 min-h-0 space-y-2 pr-1">
              {topicAddModalTab === 'conversations'
                ? (() => {
                    const memberIds = new Set(topicDetail.conversations.map((c) => c.conversation_id))
                    const available = conversations.filter((c) => !memberIds.has(c.id))
                    if (available.length === 0) {
                      return (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                          {conversations.length === 0
                            ? 'No conversations in your library yet. Save a chat first, then add it here.'
                            : 'Every library conversation is already in this topic.'}
                        </p>
                      )
                    }
                    return available.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{c.model}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!!addingTopicConvId || !!addingTopicNoteId}
                          onClick={() => void submitAddConversationToTopic(c.id)}
                          className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50"
                        >
                          {addingTopicConvId === c.id ? (
                            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            'Add'
                          )}
                        </button>
                      </div>
                    ))
                  })()
                : notesForTopicModalLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="w-7 h-7 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    </div>
                  ) : (() => {
                    const memberNoteIds = new Set(
                      topicItemsOrLegacy(topicDetail)
                        .filter((i) => i.type === 'note')
                        .map((i) => i.note_id),
                    )
                    const available = notesForTopicModal.filter((n) => !memberNoteIds.has(n.id))
                    if (available.length === 0) {
                      return (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                          {notesForTopicModal.length === 0
                            ? 'No notes in your library yet. Create one from the Notes tab, then add it here.'
                            : 'Every library note is already in this topic.'}
                        </p>
                      )
                    }
                    return available.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">{n.content_preview}</p>
                        </div>
                        <button
                          type="button"
                          disabled={!!addingTopicConvId || !!addingTopicNoteId}
                          onClick={() => void submitAddNoteToTopic(n.id)}
                          className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50"
                        >
                          {addingTopicNoteId === n.id ? (
                            <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          ) : (
                            'Add'
                          )}
                        </button>
                      </div>
                    ))
                  })()}
            </div>
            <div className="flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAddTopicConvModal(false)
                  setAddTopicConvError(null)
                }}
                disabled={!!addingTopicConvId}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create collection modal */}
      {SHOW_COLLECTIONS_IN_UI && showCreateCollection && (
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
              <div className="space-y-2">
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {createCollectionError}
                </p>
                {/limit reached|collection limit/i.test(createCollectionError) && (
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200">
                    Upgrade to Pro for more collections. Contact your administrator or use your plan settings to upgrade.
                  </div>
                )}
              </div>
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

      {/* Create learning topic modal */}
      {showCreateTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New learning topic</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Add a title, optional description, and visibility. Open the topic afterward to add conversations from your library.
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="topic-title" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Title
                </label>
                <input
                  id="topic-title"
                  type="text"
                  value={createTopicTitle}
                  onChange={(e) => setCreateTopicTitle(e.target.value)}
                  placeholder="e.g. Python asyncio"
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-indigo-500"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="topic-description" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Description <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <textarea
                  id="topic-description"
                  value={createTopicDescription}
                  onChange={(e) => setCreateTopicDescription(e.target.value)}
                  placeholder="Notes or goals for this topic…"
                  rows={3}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 resize-y min-h-[4.5rem]"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Visibility</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateTopicVisibility('private')}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${
                      createTopicVisibility === 'private'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    Private
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateTopicVisibility('public')}
                    className={`flex-1 text-xs py-2 rounded-lg border transition-colors ${
                      createTopicVisibility === 'public'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                    }`}
                  >
                    Public
                  </button>
                </div>
              </div>
            </div>
            {createTopicError && (
              <div className="space-y-2">
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {createTopicError}
                </p>
                {/learning topic limit|limit reached/i.test(createTopicError) && (
                  <p className="text-xs text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2">
                    Upgrade to Pro for a higher cap, or delete an existing topic to free a slot.
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateTopic(false)
                  setCreateTopicError(null)
                }}
                disabled={isCreatingTopic}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitCreateTopic()}
                disabled={isCreatingTopic}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isCreatingTopic && (
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
    {showNoteEditor && (
      <NoteEditor
        noteId={activeNoteId}
        onClose={() => setShowNoteEditor(false)}
        onSaved={handleNoteSaved}
        onDeleted={handleNoteDeleted}
      />
    )}
    </>
  )
}
