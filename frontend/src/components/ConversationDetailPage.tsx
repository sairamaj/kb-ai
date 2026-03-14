import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { USER_ROLE_LABELS } from '../types/auth'
import { MessageBubble } from './MessageBubble'
import { ReplayMode } from './ReplayMode'
import { ThemeToggle } from './ThemeToggle'
import { UsageDisplay } from './UsageDisplay'
import { ConversationDetail, UpdateConversationPayload } from '../types/conversation'
import type { CollectionSummary } from '../types/collection'
import { Message } from '../types/chat'

interface Props {
  id: string
  onBack: () => void
  onDeleted?: () => void
  onContinue?: (messages: Message[], title: string) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function toUiMessage(m: { id: string; role: string; content: string }): Message {
  return {
    id: m.id,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: new Date(),
  }
}

export function ConversationDetailPage({ id, onBack, onDeleted, onContinue }: Props) {
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()

  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const [editingTags, setEditingTags] = useState(false)
  const [tagsDraft, setTagsDraft] = useState('')
  const [tagsSaving, setTagsSaving] = useState(false)
  const tagsInputRef = useRef<HTMLInputElement>(null)

  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [pinSaving, setPinSaving] = useState(false)

  const [savedField, setSavedField] = useState<string | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [patchError, setPatchError] = useState<string | null>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [replayMode, setReplayMode] = useState(false)

  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [collectionAction, setCollectionAction] = useState<{ collectionId: string } | null>(null)

  const [linkCopied, setLinkCopied] = useState(false)
  const linkCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [exporting, setExporting] = useState(false)

  async function exportAsMarkdown() {
    if (!conv) return
    setExporting(true)
    try {
      const res = await fetch(`/api/conversations/${id}/export?format=md`, { credentials: 'include' })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="?([^";\n]+)"?/)
      const filename = match ? match[1].trim() : `${conv.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)}.md`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setPatchError('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  function copyShareLink() {
    if (!conv) return
    const url = `${window.location.origin}/c/${conv.id}`
    void navigator.clipboard.writeText(url).then(() => {
      if (linkCopyTimerRef.current) clearTimeout(linkCopyTimerRef.current)
      setLinkCopied(true)
      linkCopyTimerRef.current = setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  useEffect(() => {
    setIsLoading(true)
    setLoadError(null)
    fetch(`/api/conversations/${id}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load conversation (${res.status})`)
        return res.json() as Promise<ConversationDetail>
      })
      .then((data) => {
        setConv(data)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load conversation.')
        setIsLoading(false)
      })
  }, [id])

  useEffect(() => {
    fetch('/api/collections', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<CollectionSummary[]>) : []))
      .then(setCollections)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    if (editingTags) tagsInputRef.current?.focus()
  }, [editingTags])

  async function patch(updates: UpdateConversationPayload, fieldLabel: string) {
    setPatchError(null)
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Update failed (${res.status}): ${text}`)
      }
      const updated = (await res.json()) as ConversationDetail
      setConv(updated)
      flashSaved(fieldLabel)
    } catch (err) {
      setPatchError(err instanceof Error ? err.message : 'Update failed.')
    }
  }

  function flashSaved(label: string) {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSavedField(label)
    savedTimerRef.current = setTimeout(() => setSavedField(null), 2000)
  }

  function startEditingTitle() {
    if (!conv) return
    setTitleDraft(conv.title)
    setEditingTitle(true)
    setPatchError(null)
  }

  async function commitTitle() {
    if (!conv) return
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === conv.title) return
    setTitleSaving(true)
    await patch({ title: trimmed }, 'title')
    setTitleSaving(false)
  }

  function cancelTitle() {
    setEditingTitle(false)
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void commitTitle() }
    if (e.key === 'Escape') cancelTitle()
  }

  function startEditingTags() {
    if (!conv) return
    setTagsDraft(conv.tags.join(', '))
    setEditingTags(true)
    setPatchError(null)
  }

  async function commitTags() {
    if (!conv) return
    setEditingTags(false)
    const newTags = tagsDraft
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const unchanged =
      newTags.length === conv.tags.length &&
      newTags.every((t, i) => t === conv.tags[i])
    if (unchanged) return
    setTagsSaving(true)
    await patch({ tags: newTags }, 'tags')
    setTagsSaving(false)
  }

  function cancelTags() {
    setEditingTags(false)
  }

  function handleTagsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); void commitTags() }
    if (e.key === 'Escape') cancelTags()
  }

  async function toggleVisibility() {
    if (!conv || visibilitySaving) return
    const next = conv.visibility === 'private' ? 'public' : 'private'
    setVisibilitySaving(true)
    await patch({ visibility: next }, 'visibility')
    setVisibilitySaving(false)
  }

  async function togglePin() {
    if (!conv || pinSaving) return
    setPinSaving(true)
    await patch({ is_pinned: !conv.is_pinned }, 'pin')
    setPinSaving(false)
  }

  async function addToCollection(collectionId: string) {
    if (!conv || collectionAction) return
    setCollectionAction({ collectionId })
    try {
      const res = await fetch(`/api/collections/${collectionId}/conversations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id }),
      })
      if (!res.ok) throw new Error('Failed to add')
      const updated = (await fetch(`/api/conversations/${id}`, { credentials: 'include' }).then((r) => r.json())) as ConversationDetail
      setConv(updated)
    } finally {
      setCollectionAction(null)
    }
  }

  async function removeFromCollection(collectionId: string) {
    if (!conv || collectionAction) return
    setCollectionAction({ collectionId })
    try {
      const res = await fetch(`/api/collections/${collectionId}/conversations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to remove')
      const updated = (await fetch(`/api/conversations/${id}`, { credentials: 'include' }).then((r) => r.json())) as ConversationDetail
      setConv(updated)
    } finally {
      setCollectionAction(null)
    }
  }

  async function deleteConversation() {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      ;(onDeleted ?? onBack)()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (loadError || !conv) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center gap-4 text-gray-700 dark:text-gray-300">
        <p className="text-sm">{loadError ?? 'Conversation not found.'}</p>
        <button onClick={onBack} className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
          ← Back to chat
        </button>
      </div>
    )
  }

  if (replayMode && conv) {
    return (
      <ReplayMode
        conv={conv}
        onExit={() => setReplayMode(false)}
        onReplayCountUpdated={(newCount) =>
          setConv((prev) => prev ? { ...prev, replay_count: newCount } : prev)
        }
      />
    )
  }

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
            <span className="font-semibold text-sm">Prompt KB</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onContinue && (
            <button
              onClick={() => {
                if (!conv) return
                const msgs: Message[] = conv.messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant')
                  .map((m) => ({
                    id: m.id,
                    role: m.role as Message['role'],
                    content: m.content,
                    createdAt: new Date(m.created_at),
                  }))
                onContinue(msgs, conv.title)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
              title="Continue chatting from where this conversation left off"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Continue
            </button>
          )}
          {conv?.visibility === 'public' && (
            <button
              onClick={copyShareLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 transition-colors"
              title="Copy shareable link"
            >
              {linkCopied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-600 dark:text-green-400">Copied!</span>
                </>
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
            onClick={() => { void exportAsMarkdown() }}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
            title="Download as Markdown"
          >
            {exporting ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Export
          </button>
          <button
            onClick={() => setReplayMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            title="Step through this conversation turn by turn"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
            Replay
          </button>
          <ThemeToggle />
          {user?.usage && (
            <UsageDisplay usage={user.usage} className="hidden sm:inline" />
          )}
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
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
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

          {/* Metadata card */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4">

            {/* Title */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Title</span>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => { void commitTitle() }}
                  onKeyDown={handleTitleKeyDown}
                  className="bg-white dark:bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-base font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                  disabled={titleSaving}
                />
              ) : (
                <button
                  onClick={startEditingTitle}
                  className="group flex items-center gap-2 text-left"
                  title="Click to edit title"
                >
                  <span className="text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-black dark:group-hover:text-white transition-colors">
                    {conv.title}
                  </span>
                  <span className="opacity-0 group-hover:opacity-100 text-gray-500 text-xs transition-opacity select-none">
                    ✎
                  </span>
                </button>
              )}
            </div>

            {/* Meta row: model + date */}
            <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
              <span>{conv.model}</span>
              <span>·</span>
              <span>Saved {formatDate(conv.created_at)}</span>
              {conv.updated_at !== conv.created_at && (
                <>
                  <span>·</span>
                  <span>Edited {formatDate(conv.updated_at)}</span>
                </>
              )}
              <span>·</span>
              <span>{conv.messages.length} messages</span>
              {conv.replay_count > 0 && (
                <>
                  <span>·</span>
                  <span className="text-indigo-600 dark:text-indigo-500" title="Times replayed">▶ replayed {conv.replay_count}×</span>
                </>
              )}
            </div>

            {/* Tags */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Tags</span>
              {editingTags ? (
                <input
                  ref={tagsInputRef}
                  type="text"
                  value={tagsDraft}
                  onChange={(e) => setTagsDraft(e.target.value)}
                  onBlur={() => { void commitTags() }}
                  onKeyDown={handleTagsKeyDown}
                  placeholder="e.g. python, fastapi, tips"
                  className="bg-white dark:bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                  disabled={tagsSaving}
                />
              ) : (
                <button
                  onClick={startEditingTags}
                  className="group flex flex-wrap items-center gap-2 text-left min-h-[28px]"
                  title="Click to edit tags"
                >
                  {conv.tags.length > 0 ? (
                    conv.tags.map((tag) => (
                      <span
                        key={tag}
                        className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full group-hover:border-gray-400 dark:group-hover:border-gray-600 transition-colors"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 dark:text-gray-600 text-sm group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors">
                      No tags — click to add
                    </span>
                  )}
                  <span className="opacity-0 group-hover:opacity-100 text-gray-500 text-xs transition-opacity select-none ml-1">
                    ✎
                  </span>
                </button>
              )}
            </div>

            {/* Collections */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Collections</span>
              <div className="flex flex-wrap items-center gap-2">
                {(conv.collection_ids ?? []).map((colId) => {
                  const col = collections.find((c) => c.id === colId)
                  const isRemoving = collectionAction?.collectionId === colId
                  return (
                    <span
                      key={colId}
                      className="inline-flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 rounded-full pl-2 pr-1 py-0.5"
                    >
                      {col?.name ?? colId.slice(0, 8)}
                      <button
                        type="button"
                        onClick={() => { void removeFromCollection(colId) }}
                        disabled={!!collectionAction}
                        aria-label={`Remove from ${col?.name ?? 'collection'}`}
                        className="p-0.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-800/50 disabled:opacity-50 text-amber-600 dark:text-amber-400"
                      >
                        {isRemoving ? (
                          <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin inline-block" />
                        ) : (
                          '×'
                        )}
                      </button>
                    </span>
                  )
                })}
                {collections.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      const cid = e.target.value
                      if (cid) void addToCollection(cid)
                      e.target.value = ''
                    }}
                    disabled={!!collectionAction}
                    className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Add to collection…</option>
                    {collections
                      .filter((c) => c.is_owner !== false && !(conv.collection_ids ?? []).includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                )}
              </div>
            </div>

            {/* Pin toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Pinned</span>
              <button
                onClick={() => { void togglePin() }}
                disabled={pinSaving}
                className={`
                  self-start flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
                  ${conv.is_pinned
                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 hover:border-amber-400 dark:hover:border-amber-500'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
                title={conv.is_pinned ? 'Unpin from Library top' : 'Pin to top of Library'}
              >
                {conv.is_pinned ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                )}
                <span>{conv.is_pinned ? 'Pinned' : 'Not pinned'}</span>
                {pinSaving && (
                  <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                )}
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-600">
                {conv.is_pinned ? 'This conversation appears at the top of your Library.' : 'Pin to show this at the top of your Library.'}
              </p>
            </div>

            {/* Visibility toggle */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Visibility</span>
              <button
                onClick={() => { void toggleVisibility() }}
                disabled={visibilitySaving}
                className={`
                  self-start flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors
                  ${conv.visibility === 'public'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-500'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <span>{conv.visibility === 'public' ? '🌐' : '🔒'}</span>
                <span className="capitalize">{conv.visibility}</span>
                {visibilitySaving && (
                  <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
                )}
              </button>
              {conv.visibility === 'public' ? (
                <p className="text-xs text-gray-400 dark:text-gray-600">
                  Anyone with the link can view this conversation.{' '}
                  <button
                    onClick={copyShareLink}
                    className="text-indigo-600 dark:text-indigo-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                  >
                    {linkCopied ? '✓ Link copied!' : 'Copy link'}
                  </button>
                </p>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-600">Only you can see this conversation.</p>
              )}
            </div>

            {/* Save indicator / error */}
            {savedField && (
              <p className="text-xs text-green-600 dark:text-green-400">✓ {savedField.charAt(0).toUpperCase() + savedField.slice(1)} saved.</p>
            )}
            {patchError && (
              <p className="text-xs text-red-600 dark:text-red-400">{patchError}</p>
            )}

            {/* Delete section */}
            <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-red-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  Delete conversation…
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Permanently delete <span className="font-medium text-gray-900 dark:text-gray-100">"{conv.title}"</span> and all its messages?
                  </p>
                  {deleteError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{deleteError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { void deleteConversation() }}
                      disabled={isDeleting}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isDeleting && <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                      Yes, delete
                    </button>
                    <button
                      onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
                      disabled={isDeleting}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Editing hints */}
          <p className="text-xs text-gray-400 dark:text-gray-600 -mt-3">
            Click on the title or tags to edit them inline. Press Enter or click away to save.
          </p>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Message history */}
          <div className="flex flex-col gap-1 mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              Message history ({conv.messages.length})
            </span>
            <p className="text-xs text-gray-400 dark:text-gray-600">Read-only — message history cannot be edited.</p>
          </div>

          <div className="flex flex-col gap-4 pb-8">
            {conv.messages.map((m) => (
              <MessageBubble key={m.id} message={toUiMessage(m)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
