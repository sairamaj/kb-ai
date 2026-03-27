import { useEffect, useRef, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../types/chat'
import type { TopicReplayEntry, TopicReplayResponse } from '../types/learningTopic'
import { getApiUrl } from '../api/base'

function toUiMessage(entry: TopicReplayEntry): Message {
  return {
    id: entry.message.id,
    role: entry.message.role as Message['role'],
    content: entry.message.content,
    createdAt: new Date(entry.message.created_at),
  }
}

interface Props {
  topicId: string
  onExit: () => void
}

export function TopicReplayMode({ topicId, onExit }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [data, setData] = useState<TopicReplayResponse | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const postReplaySent = useRef(false)

  useEffect(() => {
    postReplaySent.current = false
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetch(getApiUrl(`learning-topics/${topicId}/replay`), { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          const detail = (body as { detail?: unknown })?.detail
          const msg =
            typeof detail === 'string'
              ? detail
              : `Failed to load topic replay (${r.status})`
          throw new Error(msg)
        }
        return r.json() as Promise<TopicReplayResponse>
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload)
          setCurrentIndex(0)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load topic replay.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [topicId])

  useEffect(() => {
    if (!data || data.total_messages === 0) return
    if (postReplaySent.current) return
    postReplaySent.current = true
    fetch(getApiUrl(`learning-topics/${topicId}/replay`), {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => undefined)
  }, [data, topicId])

  const items = data?.items ?? []
  const totalMessages = items.length
  const current = items[currentIndex]
  const progressPct =
    totalMessages > 1 ? (currentIndex / (totalMessages - 1)) * 100 : totalMessages === 1 ? 100 : 0

  function goNext() {
    setCurrentIndex((i) => Math.min(i + 1, totalMessages - 1))
  }

  function goPrev() {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentIndex((i) => Math.min(i + 1, Math.max(totalMessages - 1, 0)))
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [totalMessages])

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading topic replay…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white dark:bg-gray-950 text-gray-700 dark:text-gray-300 px-4">
        <p className="text-sm text-center max-w-md">{loadError}</p>
        <button
          type="button"
          onClick={onExit}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
        >
          ← Back to topic
        </button>
      </div>
    )
  }

  if (!data || totalMessages === 0) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white dark:bg-gray-950 text-gray-500 dark:text-gray-400 px-4">
        <p className="text-sm text-center">This topic has no messages to replay yet.</p>
        <button
          type="button"
          onClick={onExit}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
        >
          ← Back to topic
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col h-[100dvh] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
          >
            ← Exit
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-300 truncate">
              Topic replay
            </span>
          </div>
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[40%] text-right" title={data.topic_title}>
          {data.topic_title}
        </span>
      </header>

      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/50 dark:bg-gray-900/50">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Message {currentIndex + 1} of {totalMessages}
            </span>
            <span>{Math.round(progressPct)}% through</span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {current && (
            <p className="text-xs text-gray-500 dark:text-gray-500 truncate" title={current.conversation_title}>
              From: <span className="text-gray-700 dark:text-gray-300">{current.conversation_title}</span>
            </p>
          )}
          {totalMessages <= 24 && (
            <div className="flex items-center justify-center gap-1.5 mt-0.5 flex-wrap">
              {items.map((entry, idx) => (
                <button
                  key={entry.message.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`rounded-full transition-all duration-200 ${
                    idx === currentIndex
                      ? 'w-2.5 h-2.5 bg-indigo-400'
                      : idx < currentIndex
                        ? 'w-2 h-2 bg-indigo-400 dark:bg-indigo-700 hover:bg-indigo-500'
                        : 'w-2 h-2 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                  title={`Go to message ${idx + 1}`}
                  aria-label={`Go to message ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-8">
          {current && (
            <MessageBubble key={`${current.message.id}-${currentIndex}`} message={toUiMessage(current)} />
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 px-4 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <button
              type="button"
              onClick={() => setCurrentIndex(0)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Restart from the first message"
            >
              ↺ Restart
            </button>

            {currentIndex < totalMessages - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onExit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-600 transition-colors"
              >
                Done
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-600">
            Use{' '}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
              ←
            </kbd>{' '}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
              →
            </kbd>{' '}
            to move between messages
          </p>
        </div>
      </div>
    </div>
  )
}
