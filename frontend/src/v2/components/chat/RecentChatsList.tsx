import { useMemo, useState } from 'react'
import type { ConversationSummary } from '../../../types/conversation'
import { useRecentChats } from '../../hooks/useRecentChats'
import { SearchIcon } from '../shell/icons'

interface Props {
  selectedId?: string
  onOpen: (id: string) => void
}

interface Group {
  label: string
  items: ConversationSummary[]
}

function groupChats(chats: ConversationSummary[]): Group[] {
  const now = Date.now()
  const ONE_DAY = 24 * 60 * 60 * 1000
  const today: ConversationSummary[] = []
  const thisWeek: ConversationSummary[] = []
  const older: ConversationSummary[] = []
  for (const c of chats) {
    const updated = new Date(c.updated_at).getTime()
    const diff = now - updated
    if (diff < ONE_DAY) today.push(c)
    else if (diff < 7 * ONE_DAY) thisWeek.push(c)
    else older.push(c)
  }
  const groups: Group[] = []
  if (today.length > 0) groups.push({ label: 'Today', items: today })
  if (thisWeek.length > 0) groups.push({ label: 'This week', items: thisWeek })
  if (older.length > 0) groups.push({ label: 'Older', items: older })
  return groups
}

/**
 * Scrollable list of recent conversations grouped by recency.
 * Clicking an item opens that conversation inside the v2 chat view.
 */
export function RecentChatsList({ selectedId, onOpen }: Props) {
  const { data: chats = [], isLoading, error } = useRecentChats()
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return chats
    return chats.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) ||
        c.tags.some((t) => t.toLowerCase().includes(needle)),
    )
  }, [chats, q])

  const groups = useMemo(() => groupChats(filtered), [filtered])

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900">
        <span className="h-3.5 w-3.5 text-gray-400">
          <SearchIcon />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter chats"
          data-v2-search="chats"
          className="w-full bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      {isLoading && (
        <div className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">Loading…</div>
      )}
      {error && (
        <div className="px-2 py-2 text-[11px] text-red-600 dark:text-red-400">
          Couldn't load chats.
        </div>
      )}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">
          {q ? 'No matches.' : 'No saved conversations yet.'}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.label} className="mb-3">
          <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {g.label}
          </div>
          <ul className="flex flex-col">
            {g.items.map((c) => {
              const active = c.id === selectedId
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className={[
                      'group flex w-full flex-col rounded-md px-2 py-1.5 text-left',
                      active
                        ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
                        : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-200 dark:hover:bg-gray-800',
                    ].join(' ')}
                    title={c.title}
                  >
                    <span className="truncate text-xs font-medium">{c.title || 'Untitled'}</span>
                    {c.tags.length > 0 && (
                      <span className="mt-0.5 truncate text-[10px] text-gray-500 dark:text-gray-400">
                        {c.tags.slice(0, 3).join(' · ')}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
