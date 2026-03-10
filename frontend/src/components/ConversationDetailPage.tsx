import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { MessageBubble } from './MessageBubble'
import { ConversationDetail, UpdateConversationPayload } from '../types/conversation'
import { Message } from '../types/chat'

interface Props {
  id: string
  onBack: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Convert API message to the shape MessageBubble expects.
function toUiMessage(m: { id: string; role: string; content: string }): Message {
  return {
    id: m.id,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: new Date(),
  }
}

export function ConversationDetailPage({ id, onBack }: Props) {
  const { user, logout } = useAuth()

  const [conv, setConv] = useState<ConversationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Title inline-edit state
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleSaving, setTitleSaving] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Tags inline-edit state
  const [editingTags, setEditingTags] = useState(false)
  const [tagsDraft, setTagsDraft] = useState('')
  const [tagsSaving, setTagsSaving] = useState(false)
  const tagsInputRef = useRef<HTMLInputElement>(null)

  // Visibility toggle state
  const [visibilitySaving, setVisibilitySaving] = useState(false)

  // Transient save confirmation
  const [savedField, setSavedField] = useState<string | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Patch-level error
  const [patchError, setPatchError] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

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

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus()
  }, [editingTitle])

  useEffect(() => {
    if (editingTags) tagsInputRef.current?.focus()
  }, [editingTags])

  // ---------------------------------------------------------------------------
  // Patch helper
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Title handlers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Tags handlers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Visibility handler
  // ---------------------------------------------------------------------------

  async function toggleVisibility() {
    if (!conv || visibilitySaving) return
    const next = conv.visibility === 'private' ? 'public' : 'private'
    setVisibilitySaving(true)
    await patch({ visibility: next }, 'visibility')
    setVisibilitySaving(false)
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (loadError || !conv) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-gray-300">
        <p className="text-sm">{loadError ?? 'Conversation not found.'}</p>
        <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Back to chat
        </button>
      </div>
    )
  }

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
            <span className="font-semibold text-sm">Prompt KB</span>
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
        </div>
      </header>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">

          {/* Metadata card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-4">

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
                  className="bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-base font-semibold text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                  disabled={titleSaving}
                />
              ) : (
                <button
                  onClick={startEditingTitle}
                  className="group flex items-center gap-2 text-left"
                  title="Click to edit title"
                >
                  <span className="text-base font-semibold text-gray-100 group-hover:text-white transition-colors">
                    {conv.title}
                  </span>
                  <span className="opacity-0 group-hover:opacity-100 text-gray-500 text-xs transition-opacity select-none">
                    ✎
                  </span>
                </button>
              )}
            </div>

            {/* Meta row: model + date */}
            <div className="text-xs text-gray-500 flex items-center gap-3">
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
                  className="bg-gray-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
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
                        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full group-hover:border-gray-600 transition-colors"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-600 text-sm group-hover:text-gray-400 transition-colors">
                      No tags — click to add
                    </span>
                  )}
                  <span className="opacity-0 group-hover:opacity-100 text-gray-500 text-xs transition-opacity select-none ml-1">
                    ✎
                  </span>
                </button>
              )}
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
                    ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-500'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
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
              <p className="text-xs text-gray-600">
                {conv.visibility === 'public'
                  ? 'Anyone with the link can view this conversation.'
                  : 'Only you can see this conversation.'}
              </p>
            </div>

            {/* Save indicator / error */}
            {savedField && (
              <p className="text-xs text-green-400">✓ {savedField.charAt(0).toUpperCase() + savedField.slice(1)} saved.</p>
            )}
            {patchError && (
              <p className="text-xs text-red-400">{patchError}</p>
            )}
          </div>

          {/* Editing hints */}
          <p className="text-xs text-gray-600 -mt-3">
            Click on the title or tags to edit them inline. Press Enter or click away to save.
          </p>

          {/* Divider */}
          <div className="border-t border-gray-800" />

          {/* Message history */}
          <div className="flex flex-col gap-1 mb-1">
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              Message history ({conv.messages.length})
            </span>
            <p className="text-xs text-gray-600">Read-only — message history cannot be edited.</p>
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
