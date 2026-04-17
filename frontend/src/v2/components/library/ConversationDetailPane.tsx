import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MessageBubble } from '../../../components/MessageBubble'
import { ReplayMode } from '../../../components/ReplayMode'
import type { ConversationDetail } from '../../../types/conversation'
import type { Message } from '../../../types/chat'
// Note: ReplayMode accepts the full ConversationDetail, not a Message[] list.
import { getApiUrl } from '../../../api/base'
import { TrashIcon } from '../shell/icons'
import type { V2Route } from '../../routing'

interface Props {
  conversationId: string
  navigate: (route: V2Route) => void
  onDeleted: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function toMessage(m: { id: string; role: string; content: string; created_at: string }): Message {
  return {
    id: m.id,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: new Date(m.created_at),
  }
}

export function ConversationDetailPane({ conversationId, navigate, onDeleted }: Props) {
  const queryClient = useQueryClient()
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replayOpen, setReplayOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [visibilitySaving, setVisibilitySaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(getApiUrl(`conversations/${conversationId}`), {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        const data = (await res.json()) as ConversationDetail
        if (!cancelled) setDetail(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  async function handleDelete() {
    if (!detail) return
    setDeleting(true)
    try {
      const res = await fetch(getApiUrl(`conversations/${conversationId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      queryClient.invalidateQueries({ queryKey: ['v2', 'recent-chats'] })
      queryClient.invalidateQueries({ queryKey: ['v2', 'library', 'conversations'] })
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  async function handleToggleVisibility() {
    if (!detail) return
    setVisibilitySaving(true)
    try {
      const next = detail.visibility === 'public' ? 'private' : 'public'
      const res = await fetch(getApiUrl(`conversations/${conversationId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ visibility: next }),
      })
      if (!res.ok) throw new Error(`Update failed (${res.status})`)
      const updated = (await res.json()) as ConversationDetail
      setDetail(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setVisibilitySaving(false)
    }
  }

  async function handleCopyShareLink() {
    if (!detail || detail.visibility !== 'public') return
    const url = `${window.location.origin}/c/${detail.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  function handleContinue() {
    navigate({ name: 'chat', conversationId })
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600 dark:text-red-400">{error}</div>
  }

  if (!detail) return null

  const nonSystem = detail.messages.filter((m) => m.role !== 'system')

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-gray-800">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {detail.title}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span>{formatDate(detail.updated_at)}</span>
            <span>·</span>
            <span>{nonSystem.length} messages</span>
            <span>·</span>
            <span>{detail.model}</span>
            {detail.replay_count > 0 && (
              <>
                <span>·</span>
                <span className="text-indigo-500 dark:text-indigo-400">
                  ▶ {detail.replay_count} replays
                </span>
              </>
            )}
          </div>
          {detail.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {detail.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReplayOpen(true)}
            className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
          >
            ▶ Replay
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Continue chat
          </button>
          <button
            type="button"
            onClick={() => void handleToggleVisibility()}
            disabled={visibilitySaving}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {detail.visibility === 'public' ? 'Make private' : 'Make public'}
          </button>
          {detail.visibility === 'public' && (
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          )}
          {!deleteConfirm ? (
            <button
              type="button"
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-1 rounded border border-red-300 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-gray-900 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <span className="h-3.5 w-3.5">
                <TrashIcon />
              </span>
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 dark:border-red-800 dark:bg-red-900/20">
              <span className="text-[11px] text-red-700 dark:text-red-300">Delete?</span>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded bg-red-600 px-2 py-0.5 text-[11px] text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? '…' : 'Yes'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="rounded px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                No
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {nonSystem.map((m) => (
            <MessageBubble key={m.id} message={toMessage(m)} />
          ))}
        </div>
      </div>

      {replayOpen && (
        <ReplayMode
          conv={detail}
          onExit={() => setReplayOpen(false)}
          onReplayCountUpdated={(newCount) =>
            setDetail((prev) => (prev ? { ...prev, replay_count: newCount } : prev))
          }
        />
      )}
    </div>
  )
}
