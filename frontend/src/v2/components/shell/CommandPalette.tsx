import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../context/AuthContext'
import { useTheme } from '../../../context/ThemeContext'
import type { ConversationSummary } from '../../../types/conversation'
import type { NoteSummary } from '../../../types/note'
import type { LearningTopicListItem } from '../../../types/learningTopic'
import { getApiUrl } from '../../../api/base'
import type { V2Route } from '../../routing'

interface Props {
  open: boolean
  onClose: () => void
  navigate: (route: V2Route) => void
}

interface CommandItem {
  id: string
  label: string
  hint?: string
  group: 'Navigate' | 'Actions' | 'Recent chats' | 'Recent notes' | 'Recent topics'
  action: () => void
}

async function fetchRecentConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(getApiUrl('conversations?sort=recent'), { credentials: 'include' })
  if (!res.ok) return []
  return res.json()
}

async function fetchRecentNotes(): Promise<NoteSummary[]> {
  const res = await fetch(getApiUrl('notes?pinned_first=true'), { credentials: 'include' })
  if (!res.ok) return []
  return res.json()
}

async function fetchRecentTopics(): Promise<LearningTopicListItem[]> {
  const res = await fetch(getApiUrl('learning-topics'), { credentials: 'include' })
  if (!res.ok) return []
  return res.json()
}

/**
 * Ctrl/Cmd+K palette with section navigation, quick actions, and recent
 * items (chats, notes, topics) so keyboard users can reach anything fast.
 */
export function CommandPalette({ open, onClose, navigate }: Props) {
  const [q, setQ] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const { user } = useAuth()
  const { cycleTheme } = useTheme()

  const recentChatsQ = useQuery({
    queryKey: ['v2', 'recent-chats'],
    queryFn: fetchRecentConversations,
    enabled: open && !!user,
    staleTime: 30 * 1000,
  })
  const recentNotesQ = useQuery({
    queryKey: ['v2', 'recent-notes'],
    queryFn: fetchRecentNotes,
    enabled: open && !!user,
    staleTime: 30 * 1000,
  })
  const recentTopicsQ = useQuery({
    queryKey: ['v2', 'recent-topics'],
    queryFn: fetchRecentTopics,
    enabled: open && !!user,
    staleTime: 30 * 1000,
  })

  useEffect(() => {
    if (open) {
      setQ('')
      setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const items: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      { id: 'go-chat', label: 'Go to Chat', group: 'Navigate', action: () => navigate({ name: 'chat' }) },
      {
        id: 'go-library',
        label: 'Go to Library',
        group: 'Navigate',
        action: () => navigate({ name: 'library', tab: 'conversations' }),
      },
      { id: 'go-notes', label: 'Go to Notes', group: 'Navigate', action: () => navigate({ name: 'notes' }) },
      { id: 'go-topics', label: 'Go to Learning Topics', group: 'Navigate', action: () => navigate({ name: 'topics' }) },
      { id: 'go-feed', label: 'Go to Feed', group: 'Navigate', action: () => navigate({ name: 'feed' }) },
      { id: 'new-chat', label: 'New chat', hint: 'Ctrl/Cmd+N', group: 'Actions', action: () => navigate({ name: 'chat' }) },
      { id: 'new-note', label: 'New note', group: 'Actions', action: () => navigate({ name: 'notes' }) },
      { id: 'toggle-theme', label: 'Toggle theme', group: 'Actions', action: () => cycleTheme() },
    ]

    if (user?.role === 'administrator') {
      list.push({
        id: 'go-reports',
        label: 'Go to Reports',
        group: 'Navigate',
        action: () => navigate({ name: 'reports' }),
      })
    }

    for (const c of (recentChatsQ.data ?? []).slice(0, 8)) {
      list.push({
        id: `chat:${c.id}`,
        label: c.title || 'Untitled',
        hint: 'Conversation',
        group: 'Recent chats',
        action: () => navigate({ name: 'chat', conversationId: c.id }),
      })
    }
    for (const n of (recentNotesQ.data ?? []).slice(0, 8)) {
      list.push({
        id: `note:${n.id}`,
        label: n.title || 'Untitled note',
        hint: 'Note',
        group: 'Recent notes',
        action: () => navigate({ name: 'notes', noteId: n.id }),
      })
    }
    for (const t of (recentTopicsQ.data ?? []).slice(0, 8)) {
      list.push({
        id: `topic:${t.id}`,
        label: t.title,
        hint: 'Topic',
        group: 'Recent topics',
        action: () => navigate({ name: 'topics', topicId: t.id }),
      })
    }

    return list
  }, [navigate, cycleTheme, user?.role, recentChatsQ.data, recentNotesQ.data, recentTopicsQ.data])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(needle) || it.group.toLowerCase().includes(needle),
    )
  }, [items, q])

  const grouped = useMemo(() => {
    const map = new Map<CommandItem['group'], CommandItem[]>()
    for (const it of filtered) {
      const arr = map.get(it.group)
      if (arr) arr.push(it)
      else map.set(it.group, [it])
    }
    return Array.from(map.entries())
  }, [filtered])

  function runItem(item: CommandItem) {
    item.action()
    onClose()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[highlight]
      if (item) runItem(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLButtonElement>(`[data-cmd-index="${highlight}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  if (!open) return null

  let idx = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="border-b border-gray-200 p-3 dark:border-gray-800">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command, or search chats, notes, topics…"
            className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">No matches</li>
          )}
          {grouped.map(([group, groupItems]) => (
            <li key={group}>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group}
              </div>
              <ul>
                {groupItems.map((item) => {
                  idx += 1
                  const active = idx === highlight
                  const thisIdx = idx
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-cmd-index={thisIdx}
                        onMouseEnter={() => setHighlight(thisIdx)}
                        onClick={() => runItem(item)}
                        className={[
                          'flex w-full items-center justify-between px-4 py-2 text-left text-sm',
                          active
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200'
                            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800',
                        ].join(' ')}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.hint && (
                          <span className="ml-3 flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                            {item.hint}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400 dark:border-gray-800 dark:text-gray-500">
          <span>
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">↑</kbd>{' '}
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">↓</kbd> navigate{' '}
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">Enter</kbd> select{' '}
            <kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
