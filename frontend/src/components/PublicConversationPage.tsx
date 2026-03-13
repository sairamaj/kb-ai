import { useEffect, useRef, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { ThemeToggle } from './ThemeToggle'
import type { PublicConversationDetail } from '../types/conversation'
import type { Message } from '../types/chat'

interface Props {
  id: string
  onGoToFeed: () => void
  onGoToLogin: () => void
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

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-6 h-6 rounded-full object-cover"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

export function PublicConversationPage({ id, onGoToFeed, onGoToLogin }: Props) {
  const [conv, setConv] = useState<PublicConversationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)

  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    fetch(`/api/conversations/${id}/public`)
      .then(async (res) => {
        if (!res.ok) {
          setErrorStatus(res.status)
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error((body as { detail?: string }).detail ?? res.statusText)
        }
        return res.json() as Promise<PublicConversationDetail>
      })
      .then((data) => {
        setConv(data)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load conversation.')
        setIsLoading(false)
      })
  }, [id])

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopied(true)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error || !conv) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center gap-5 px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {errorStatus === 403 ? (
            <>
              <span className="text-4xl">🔒</span>
              <p className="text-gray-800 dark:text-gray-200 font-semibold">This conversation is private</p>
              <p className="text-sm text-gray-500">The owner hasn't made it public.</p>
            </>
          ) : errorStatus === 404 ? (
            <>
              <span className="text-4xl">🔍</span>
              <p className="text-gray-800 dark:text-gray-200 font-semibold">Conversation not found</p>
              <p className="text-sm text-gray-500">This link may be invalid or the conversation was deleted.</p>
            </>
          ) : (
            <>
              <p className="text-gray-800 dark:text-gray-200 font-semibold">Something went wrong</p>
              <p className="text-sm text-gray-500">{error}</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onGoToFeed}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
          >
            ← Browse public conversations
          </button>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <button
            onClick={onGoToLogin}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onGoToFeed}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ← Discover
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
              KB
            </div>
            <span className="font-semibold text-sm hidden sm:block">Prompt KB</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 transition-colors"
          >
            {copied ? (
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
          <button
            onClick={onGoToLogin}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            Sign in
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

          {/* Public badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
              Public conversation
            </span>
          </div>

          {/* Metadata card */}
          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-snug">{conv.title}</h1>

            {/* Author */}
            <div className="flex items-center gap-2">
              <AuthorAvatar name={conv.author_name} avatarUrl={conv.author_avatar} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{conv.author_name}</span>
            </div>

            {/* Meta row */}
            <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
              <span>{conv.model}</span>
              <span>·</span>
              <span>{formatDate(conv.created_at)}</span>
              <span>·</span>
              <span>{conv.messages.length} messages</span>
              {conv.replay_count > 0 && (
                <>
                  <span>·</span>
                  <span className="text-indigo-600 dark:text-indigo-500">▶ replayed {conv.replay_count}×</span>
                </>
              )}
            </div>

            {/* Tags */}
            {conv.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {conv.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-800" />

          {/* Message history */}
          <div className="flex flex-col gap-1 -mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              Message history ({conv.messages.length})
            </span>
          </div>

          <div className="flex flex-col gap-4 pb-16">
            {conv.messages.map((m) => (
              <MessageBubble key={m.id} message={toUiMessage(m)} />
            ))}
          </div>
        </div>
      </div>

      {/* Sticky footer CTA */}
      <div className="sticky bottom-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Want to save your own AI conversations?
          </p>
          <button
            onClick={onGoToLogin}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            Start for free →
          </button>
        </div>
      </div>
    </div>
  )
}
