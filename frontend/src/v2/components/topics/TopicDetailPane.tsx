import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TopicReplayMode } from '../../../components/TopicReplayMode'
import { FlashcardMode } from '../../../components/FlashcardMode'
import type {
  LearningTopicDetail,
  LearningTopicItem,
} from '../../../types/learningTopic'
import { getApiUrl } from '../../../api/base'
import { parseJsonSafe, userFacingApiError } from '../../../api/errors'
import { TopicProgressStrip } from './TopicProgressStrip'
import { TrashIcon } from '../shell/icons'
import type { V2Route } from '../../routing'

interface Props {
  topicId: string
  navigate: (route: V2Route) => void
  onDeleted: () => void
  onChanged: (detail: LearningTopicDetail) => void
}

function itemsOrLegacy(detail: LearningTopicDetail): LearningTopicItem[] {
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

export function TopicDetailPane({ topicId, navigate, onDeleted, onChanged }: Props) {
  const queryClient = useQueryClient()
  const [detail, setDetail] = useState<LearningTopicDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)
  const [flashOpen, setFlashOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [flashActionError, setFlashActionError] = useState<string | null>(null)
  const [exportingFmt, setExportingFmt] = useState<'md' | 'pdf' | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(getApiUrl(`learning-topics/${topicId}`), {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = (await res.json()) as LearningTopicDetail
        if (!cancelled) {
          setDetail(data)
          onChanged(data)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [topicId, onChanged])

  async function refreshDetail() {
    try {
      const res = await fetch(getApiUrl(`learning-topics/${topicId}`), {
        credentials: 'include',
      })
      if (!res.ok) return
      const data = (await res.json()) as LearningTopicDetail
      setDetail(data)
      onChanged(data)
    } catch {
      // ignore
    }
  }

  async function toggleVisibility() {
    if (!detail) return
    setVisibilitySaving(true)
    try {
      const next = detail.visibility === 'public' ? 'private' : 'public'
      const res = await fetch(getApiUrl(`learning-topics/${topicId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ visibility: next }),
      })
      if (!res.ok) throw new Error(`Update failed (${res.status})`)
      const data = (await res.json()) as LearningTopicDetail
      setDetail(data)
      onChanged(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.')
    } finally {
      setVisibilitySaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${topicId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      queryClient.invalidateQueries({ queryKey: ['me'] })
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setDeleting(false)
      setDeleteConfirm(false)
    }
  }

  async function handleGenerateFlashcards() {
    setGenerating(true)
    setFlashActionError(null)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${topicId}/flashcards/generate`), {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const body = await parseJsonSafe(res)
        throw new Error(userFacingApiError(res.status, body))
      }
      await refreshDetail()
    } catch (err) {
      setFlashActionError(err instanceof Error ? err.message : 'Generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleExport(format: 'md' | 'pdf') {
    if (!detail) return
    setExportingFmt(format)
    try {
      const res = await fetch(getApiUrl(`learning-topics/${topicId}/export?format=${format}`), {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="?([^";\n]+)"?/)
      const ext = format === 'pdf' ? '.pdf' : '.md'
      const safeName = detail.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 80)
      const filename = match ? match[1].trim() : `${safeName}${ext}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExportingFmt(null)
    }
  }

  async function copyShareLink() {
    if (!detail) return
    const url = `${window.location.origin}/learning-topics/public/${detail.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !detail) {
    return <div className="p-6 text-sm text-red-600 dark:text-red-400">{error}</div>
  }

  if (!detail) return null

  const items = itemsOrLegacy(detail)
  const hasFlashcards = (detail.flashcards?.length ?? 0) > 0

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="flex-shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
              {detail.title}
            </h2>
            {detail.description && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail.description}</p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReplayOpen(true)}
              disabled={items.length === 0}
              className="rounded border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
            >
              ▶ Replay
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateFlashcards()}
              disabled={generating || items.length === 0}
              className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {generating ? 'Generating…' : hasFlashcards ? 'Regenerate flashcards' : 'Generate flashcards'}
            </button>
            {hasFlashcards && (
              <button
                type="button"
                onClick={() => setFlashOpen(true)}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Practice ({detail.flashcards?.length ?? 0})
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleExport('md')}
              disabled={exportingFmt !== null}
              className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {exportingFmt === 'md' ? '…' : 'Export MD'}
            </button>
            <button
              type="button"
              onClick={() => void handleExport('pdf')}
              disabled={exportingFmt !== null}
              className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {exportingFmt === 'pdf' ? '…' : 'Export PDF'}
            </button>
            <button
              type="button"
              onClick={() => void toggleVisibility()}
              disabled={visibilitySaving}
              className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {detail.visibility === 'public' ? 'Make private' : 'Make public'}
            </button>
            {detail.visibility === 'public' && (
              <button
                type="button"
                onClick={() => void copyShareLink()}
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
                <span className="text-[11px] text-red-700 dark:text-red-300">Delete topic?</span>
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
        </div>
        {flashActionError && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">{flashActionError}</div>
        )}
      </header>

      <div className="flex-1 p-6">
        <TopicProgressStrip detail={detail} />

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Items ({items.length})
          </h3>
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              This topic is empty. Use the classic Library view to add conversations or notes.
            </div>
          )}
          <ol className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <li
                key={
                  item.type === 'conversation'
                    ? `c:${item.conversation_id}`
                    : `n:${item.note_id}`
                }
                className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                        item.type === 'conversation'
                          ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
                      ].join(' ')}
                    >
                      {item.type}
                    </span>
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {item.title}
                    </span>
                    {item.reviewed_at && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                        Reviewed
                      </span>
                    )}
                  </div>
                  {item.type === 'note' && item.content_preview && (
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                      {item.content_preview}
                    </p>
                  )}
                  {item.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.tags.slice(0, 5).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {item.type === 'conversation' && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({
                        name: 'library',
                        tab: 'conversations',
                        selectedId: item.conversation_id,
                      })
                    }
                    className="text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Open →
                  </button>
                )}
                {item.type === 'note' && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ name: 'library', tab: 'notes', selectedId: item.note_id })
                    }
                    className="text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Open →
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {replayOpen && (
        <TopicReplayMode
          topicId={topicId}
          onExit={() => setReplayOpen(false)}
          onTopicProgressChanged={() => void refreshDetail()}
        />
      )}
      {flashOpen && (
        <FlashcardMode
          topicTitle={detail.title}
          cards={detail.flashcards ?? []}
          onExit={() => setFlashOpen(false)}
        />
      )}
    </div>
  )
}
