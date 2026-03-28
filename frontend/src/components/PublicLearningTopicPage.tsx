import { useEffect, useRef, useState } from 'react'
import type { FeedItem } from '../types/conversation'
import type { PublicLearningTopicDetail } from '../types/learningTopic'
import { ThemeToggle } from './ThemeToggle'
import { TopicReplayMode } from './TopicReplayMode'
import { getApiUrl } from '../api/base'

interface Props {
  id: string
  onGoToFeed: () => void
  onGoToLogin: () => void
  onOpenConversation: (id: string) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function AuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="w-5 h-5 rounded-full object-cover flex-shrink-0"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  return (
    <div className="w-5 h-5 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function TopicConversationCard({
  item,
  onClick,
}: {
  item: FeedItem
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 rounded-xl px-5 py-4 transition-colors group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-black dark:group-hover:text-white transition-colors line-clamp-2 leading-snug">
            {item.title}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <AuthorAvatar name={item.author_name} avatarUrl={item.author_avatar} />
              <span className="text-xs text-gray-600 dark:text-gray-400">{item.author_name}</span>
            </div>
            <span className="text-gray-300 dark:text-gray-700 text-xs">·</span>
            <span className="text-xs text-gray-500">{formatDate(item.updated_at)}</span>
            <span className="text-gray-300 dark:text-gray-700 text-xs">·</span>
            <span className="text-xs text-gray-500">
              {item.message_count} msg{item.message_count !== 1 ? 's' : ''}
            </span>
            {item.replay_count > 0 && (
              <>
                <span className="text-gray-300 dark:text-gray-700 text-xs">·</span>
                <span className="text-xs text-indigo-600 dark:text-indigo-500" title="Times replayed">
                  ▶ {item.replay_count}
                </span>
              </>
            )}
          </div>
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 px-1.5 py-0.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <svg
          className="w-4 h-4 text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  )
}

function toFeedItem(c: PublicLearningTopicDetail['conversations'][number]): FeedItem {
  return {
    id: c.id,
    title: c.title,
    tags: c.tags,
    model: c.model,
    message_count: c.message_count,
    replay_count: c.replay_count,
    created_at: c.created_at,
    updated_at: c.updated_at,
    author_name: c.author_name,
    author_avatar: c.author_avatar,
  }
}

export function PublicLearningTopicPage({ id, onGoToFeed, onGoToLogin, onOpenConversation }: Props) {
  const [data, setData] = useState<PublicLearningTopicDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [showReplay, setShowReplay] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    fetch(getApiUrl(`learning-topics/${id}/public`))
      .then(async (res) => {
        if (!res.ok) {
          setErrorStatus(res.status)
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error((body as { detail?: string }).detail ?? res.statusText)
        }
        return res.json() as Promise<PublicLearningTopicDetail>
      })
      .then((d) => {
        setData(d)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load learning topic.')
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center gap-5 px-4">
        <div className="flex flex-col items-center gap-2 text-center">
          {errorStatus === 403 ? (
            <>
              <span className="text-4xl">🔒</span>
              <p className="text-gray-800 dark:text-gray-200 font-semibold">This learning topic is private</p>
              <p className="text-sm text-gray-500">The owner hasn&apos;t made it public.</p>
            </>
          ) : errorStatus === 404 ? (
            <>
              <span className="text-4xl">🔍</span>
              <p className="text-gray-800 dark:text-gray-200 font-semibold">Learning topic not found</p>
              <p className="text-sm text-gray-500">This link may be invalid or the topic was deleted.</p>
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700/50 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              Public learning topic
            </span>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col gap-4">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-snug">{data.title}</h1>
            {data.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{data.description}</p>
            )}
            <div className="flex items-center gap-2">
              <AuthorAvatar name={data.author_name} avatarUrl={data.author_avatar} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{data.author_name}</span>
            </div>
            <div className="text-xs text-gray-500">
              {formatDate(data.created_at)}
              {' · '}
              {data.conversations.length} public conversation{data.conversations.length !== 1 ? 's' : ''}
            </div>
            {data.conversations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowReplay(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors w-fit mt-2"
              >
                Replay topic
              </button>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800" />

          <div className="flex flex-col gap-1 -mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Conversations in this topic</span>
          </div>

          {data.conversations.length === 0 ? (
            <p className="text-sm text-gray-500">
              No public conversations in this topic yet. Only conversations the owner has marked public appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-2 pb-16">
              {data.conversations.map((item) => (
                <TopicConversationCard
                  key={item.id}
                  item={toFeedItem(item)}
                  onClick={() => onOpenConversation(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm border-t border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">Want to build your own learning topics?</p>
          <button
            onClick={onGoToLogin}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            Start for free →
          </button>
        </div>
      </div>

      {showReplay && (
        <TopicReplayMode topicId={id} replaySource="public" onExit={() => setShowReplay(false)} />
      )}
    </div>
  )
}
