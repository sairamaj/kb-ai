import { useEffect, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { TopicReplayMode } from '../../../components/TopicReplayMode'
import type { FeedResponse, FeedItem } from '../../../types/conversation'
import type {
  PublicLearningTopicDiscoveryItem,
  PublicLearningTopicDiscoveryResponse,
} from '../../../types/learningTopic'
import { getApiUrl } from '../../../api/base'
import type { V2Route } from '../../routing'

interface Props {
  navigate: (route: V2Route) => void
}

type Tab = 'conversations' | 'topics'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function AuthorBadge({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="text-[11px] text-gray-600 dark:text-gray-400">{name}</span>
    </div>
  )
}

export function FeedView({ navigate }: Props) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('conversations')
  const [page, setPage] = useState(1)
  const [feed, setFeed] = useState<FeedResponse | null>(null)
  const [topics, setTopics] = useState<PublicLearningTopicDiscoveryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replayTopicId, setReplayTopicId] = useState<string | null>(null)

  useEffect(() => {
    setPage(1)
    setError(null)
  }, [tab])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const url =
      tab === 'conversations'
        ? `feed?page=${page}&per_page=20`
        : `learning-topics/public?page=${page}&per_page=20`
    void fetch(getApiUrl(url))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        return res.json()
      })
      .then((data) => {
        if (tab === 'conversations') setFeed(data as FeedResponse)
        else setTopics(data as PublicLearningTopicDiscoveryResponse)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
      .finally(() => setLoading(false))
  }, [tab, page])

  function openConversation(item: FeedItem) {
    window.location.assign(`/c/${item.id}`)
  }

  function openTopic(item: PublicLearningTopicDiscoveryItem) {
    window.location.assign(`/learning-topics/public/${item.id}`)
  }

  const currentPages = tab === 'conversations' ? feed?.pages ?? 1 : topics?.pages ?? 1

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <header className="flex-shrink-0 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Feed</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Discover public conversations and learning topics shared by the community.
            </p>
          </div>
          {!user && (
            <button
              type="button"
              onClick={() => navigate({ name: 'chat' })}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Sign in
            </button>
          )}
        </div>
        <nav className="mt-3 flex gap-1" aria-label="Feed tabs">
          {(['conversations', 'topics'] as Tab[]).map((t) => {
            const active = tab === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={active ? 'page' : undefined}
                className={[
                  'rounded-md px-3 py-1 text-xs font-medium capitalize',
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                {t}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          </div>
        )}
        {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}

        {!loading && tab === 'conversations' && feed && (
          <>
            {feed.items.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-500 dark:text-gray-400">
                No public conversations yet.
              </div>
            ) : (
              <ul className="mx-auto grid max-w-3xl gap-3">
                {feed.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openConversation(item)}
                      className="group block w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
                    >
                      <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {item.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <AuthorBadge name={item.author_name} avatarUrl={item.author_avatar} />
                        <span className="text-[11px] text-gray-400">·</span>
                        <span className="text-[11px] text-gray-500">
                          {formatDate(item.updated_at)}
                        </span>
                        <span className="text-[11px] text-gray-400">·</span>
                        <span className="text-[11px] text-gray-500">
                          {item.message_count} msgs
                        </span>
                        {item.replay_count > 0 && (
                          <>
                            <span className="text-[11px] text-gray-400">·</span>
                            <span className="text-[11px] text-indigo-500 dark:text-indigo-400">
                              ▶ {item.replay_count}
                            </span>
                          </>
                        )}
                      </div>
                      {item.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.tags.slice(0, 5).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!loading && tab === 'topics' && topics && (
          <>
            {topics.items.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-500 dark:text-gray-400">
                No public learning topics yet.
              </div>
            ) : (
              <ul className="mx-auto grid max-w-3xl gap-3">
                {topics.items.map((item) => (
                  <li key={item.id}>
                    <div className="group rounded-xl border border-gray-200 bg-white transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600">
                      <button
                        type="button"
                        onClick={() => openTopic(item)}
                        className="block w-full p-4 text-left"
                      >
                        <p className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                            {item.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <AuthorBadge name={item.author_name} avatarUrl={item.author_avatar} />
                          <span className="text-[11px] text-gray-400">·</span>
                          <span className="text-[11px] text-gray-500">
                            {formatDate(item.updated_at)}
                          </span>
                          <span className="text-[11px] text-gray-400">·</span>
                          <span className="text-[11px] text-gray-500">
                            {item.conversation_count} conv
                          </span>
                        </div>
                      </button>
                      {item.conversation_count > 0 && (
                        <div className="flex justify-end border-t border-gray-200 px-4 py-2 dark:border-gray-800">
                          <button
                            type="button"
                            onClick={() => setReplayTopicId(item.id)}
                            className="rounded-md border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                          >
                            Replay topic
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {!loading && currentPages > 1 && (
          <div className="mx-auto mt-6 flex max-w-3xl items-center justify-between text-xs">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Prev
            </button>
            <span className="text-gray-500 dark:text-gray-400">
              Page {page} of {currentPages}
            </span>
            <button
              type="button"
              disabled={page >= currentPages}
              onClick={() => setPage((p) => Math.min(currentPages, p + 1))}
              className="rounded border border-gray-300 bg-white px-3 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {replayTopicId && (
        <TopicReplayMode
          topicId={replayTopicId}
          onExit={() => setReplayTopicId(null)}
          replaySource={user ? 'authenticated' : 'public'}
        />
      )}
    </main>
  )
}
