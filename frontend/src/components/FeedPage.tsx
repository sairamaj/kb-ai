import { useEffect, useState } from 'react'
import type { FeedItem, FeedResponse } from '../types/conversation'

interface Props {
  onOpenConversation: (id: string) => void
  onGoToLogin: () => void
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
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className="w-5 h-5 rounded-full bg-indigo-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function FeedCard({ item, onClick }: { item: FeedItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl px-5 py-4 transition-colors group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <p className="text-sm font-medium text-gray-100 group-hover:text-white transition-colors line-clamp-2 leading-snug">
            {item.title}
          </p>

          {/* Author + meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <AuthorAvatar name={item.author_name} avatarUrl={item.author_avatar} />
              <span className="text-xs text-gray-400">{item.author_name}</span>
            </div>
            <span className="text-gray-700 text-xs">·</span>
            <span className="text-xs text-gray-500">{formatDate(item.updated_at)}</span>
            <span className="text-gray-700 text-xs">·</span>
            <span className="text-xs text-gray-500">
              {item.message_count} msg{item.message_count !== 1 ? 's' : ''}
            </span>
            {item.replay_count > 0 && (
              <>
                <span className="text-gray-700 text-xs">·</span>
                <span className="text-xs text-indigo-500" title="Times replayed">▶ {item.replay_count}</span>
              </>
            )}
          </div>

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-indigo-900/30 text-indigo-400 border border-indigo-900/50 px-1.5 py-0.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Arrow */}
        <svg
          className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0 mt-0.5"
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

export function FeedPage({ onOpenConversation, onGoToLogin }: Props) {
  const [feed, setFeed] = useState<FeedResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    const params = new URLSearchParams({ page: String(page), per_page: '20' })
    fetch(`/api/feed?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load feed (${res.status})`)
        return res.json() as Promise<FeedResponse>
      })
      .then((data) => {
        setFeed(data)
        setIsLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load feed.')
        setIsLoading(false)
      })
  }, [page])

  function goToPage(p: number) {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold">
              KB
            </div>
            <span className="font-semibold text-sm">Prompt KB</span>
          </div>
          <div className="w-px h-4 bg-gray-700" />
          <span className="text-sm text-gray-400">Discover</span>
        </div>
        <button
          onClick={onGoToLogin}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">

          {/* Hero */}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold tracking-tight">Public Conversations</h1>
            <p className="text-sm text-gray-400">
              Explore AI conversations shared by the Prompt KB community.
            </p>
          </div>

          {/* List */}
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : error ? (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
              {error}
            </div>
          ) : !feed || feed.items.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-3 text-center">
              <span className="text-4xl">💬</span>
              <p className="text-gray-400 font-medium">No public conversations yet</p>
              <p className="text-sm text-gray-600">
                Be the first to share one by marking a saved conversation as public.
              </p>
              <button
                onClick={onGoToLogin}
                className="mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Sign in to get started
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-600 -mt-2">
                {feed.total} public conversation{feed.total !== 1 ? 's' : ''}
                {feed.pages > 1 ? ` · Page ${feed.page} of ${feed.pages}` : ''}
              </p>

              <div className="flex flex-col gap-2">
                {feed.items.map((item) => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    onClick={() => onOpenConversation(item.id)}
                  />
                ))}
              </div>

              {/* Pagination */}
              {feed.pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    onClick={() => goToPage(feed.page - 1)}
                    disabled={feed.page <= 1}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: feed.pages }, (_, i) => i + 1)
                      .filter((p) => {
                        const cur = feed.page
                        return p === 1 || p === feed.pages || Math.abs(p - cur) <= 2
                      })
                      .reduce<(number | '...')[]>((acc, p, i, arr) => {
                        if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) {
                          acc.push('...')
                        }
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, i) =>
                        p === '...' ? (
                          <span key={`ellipsis-${i}`} className="px-1 text-gray-600 text-sm">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => goToPage(p as number)}
                            className={`w-8 h-8 text-sm rounded-lg transition-colors ${
                              p === feed.page
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {p}
                          </button>
                        ),
                      )}
                  </div>
                  <button
                    onClick={() => goToPage(feed.page + 1)}
                    disabled={feed.page >= feed.pages}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <footer className="border-t border-gray-800 px-4 py-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            Save and share your own AI conversations with Prompt KB.
          </p>
          <button
            onClick={onGoToLogin}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            Get started free →
          </button>
        </div>
      </footer>
    </div>
  )
}
