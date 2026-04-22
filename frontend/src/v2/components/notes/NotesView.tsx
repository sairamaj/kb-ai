import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ContextColumn } from '../shell/ContextColumn'
import { PlusIcon, PinIcon, SearchIcon } from '../shell/icons'
import { NoteEditor } from '../../../components/NoteEditor'
import type { NoteSummary, NoteDetail } from '../../../types/note'
import { getApiUrl } from '../../../api/base'
import { useDebounce } from '../../hooks/useDebounce'
import type { V2Route } from '../../routing'

interface Props {
  route: Extract<V2Route, { name: 'notes' }>
  navigate: (route: V2Route) => void
  ctxCollapsed: boolean
  onToggleCtx: () => void
}

export function NotesView({ route, navigate, ctxCollapsed, onToggleCtx }: Props) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [creatingNew, setCreatingNew] = useState(false)
  const debouncedQuery = useDebounce(q, 300)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (debouncedQuery) params.set('q', debouncedQuery)
    params.set('pinned_first', 'true')
    fetch(getApiUrl(`notes?${params.toString()}`), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json() as Promise<NoteSummary[]>
      })
      .then((data) => {
        if (!cancelled) setNotes(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const tagIndex = useMemo(() => {
    const set = new Set<string>()
    for (const n of notes) for (const t of n.tags) set.add(t)
    return Array.from(set).sort()
  }, [notes])

  const filteredNotes = useMemo(() => {
    if (activeTags.length === 0) return notes
    return notes.filter((n) => activeTags.every((t) => n.tags.includes(t)))
  }, [notes, activeTags])

  const pinned = filteredNotes.filter((n) => n.is_pinned)
  const others = filteredNotes.filter((n) => !n.is_pinned)

  function toggleTag(t: string) {
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  function selectNote(id: string) {
    setCreatingNew(false)
    navigate({ name: 'notes', noteId: id })
  }

  function handleNewNote() {
    setCreatingNew(true)
    // Clear id from URL so a new (empty) editor is shown.
    navigate({ name: 'notes' })
  }

  function handleNoteSaved(note: NoteDetail, isNew: boolean) {
    const summary: NoteSummary = {
      id: note.id,
      title: note.title,
      tags: note.tags,
      content_preview: note.content.slice(0, 200),
      visibility: note.visibility,
      is_pinned: note.is_pinned,
      updated_at: note.updated_at,
    }
    setNotes((prev) => {
      const existing = prev.findIndex((n) => n.id === note.id)
      if (existing >= 0) {
        const copy = [...prev]
        copy[existing] = summary
        return copy
      }
      return [summary, ...prev]
    })
    if (isNew) {
      setCreatingNew(false)
      navigate({ name: 'notes', noteId: note.id })
      queryClient.invalidateQueries({ queryKey: ['me'] })
    }
  }

  function handleNoteDeleted(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setCreatingNew(false)
    navigate({ name: 'notes' })
  }

  const showEditor = !!route.noteId || creatingNew
  const editorKey = creatingNew ? '__new__' : route.noteId ?? '__empty__'

  return (
    <>
      <ContextColumn
        title="Notes"
        collapsed={ctxCollapsed}
        onToggleCollapsed={onToggleCtx}
        headerAction={
          <button
            type="button"
            onClick={handleNewNote}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
          >
            <span className="h-3.5 w-3.5">
              <PlusIcon />
            </span>
            New note
          </button>
        }
      >
        <div className="mb-2 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 dark:border-gray-800 dark:bg-gray-900">
          <span className="h-3.5 w-3.5 text-gray-400">
            <SearchIcon />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes"
            data-v2-search="notes"
            className="w-full bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        {tagIndex.length > 0 && (
          <div className="mb-3 flex max-h-24 flex-wrap gap-1 overflow-y-auto px-1">
            {tagIndex.map((t) => {
              const active = activeTags.includes(t)
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTag(t)}
                  className={[
                    'rounded-full border px-2 py-0.5 text-[10px]',
                    active
                      ? 'border-indigo-500 bg-indigo-100 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {t}
                </button>
              )
            })}
          </div>
        )}

        {loading && (
          <div className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">Loading…</div>
        )}
        {error && (
          <div className="px-2 py-2 text-[11px] text-red-600 dark:text-red-400">{error}</div>
        )}
        {!loading && filteredNotes.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-gray-500 dark:text-gray-400">
            {notes.length === 0 ? 'No notes yet.' : 'No notes match filters.'}
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div className="mt-1 mb-1 flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <span className="h-3 w-3">
                <PinIcon />
              </span>
              Pinned
            </div>
            <ul className="mb-3 flex flex-col">
              {pinned.map((n) => (
                <NoteListItem
                  key={n.id}
                  note={n}
                  selected={route.noteId === n.id}
                  onOpen={() => selectNote(n.id)}
                />
              ))}
            </ul>
          </>
        )}
        {others.length > 0 && (
          <>
            <div className="mt-1 mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              All notes
            </div>
            <ul className="flex flex-col">
              {others.map((n) => (
                <NoteListItem
                  key={n.id}
                  note={n}
                  selected={route.noteId === n.id}
                  onOpen={() => selectNote(n.id)}
                />
              ))}
            </ul>
          </>
        )}
      </ContextColumn>

      <main className="flex-1 overflow-hidden">
        {showEditor ? (
          <div className="h-full overflow-auto">
            <NoteEditor
              key={editorKey}
              noteId={creatingNew ? null : route.noteId ?? null}
              onClose={() => {
                setCreatingNew(false)
                navigate({ name: 'notes' })
              }}
              onSaved={handleNoteSaved}
              onDeleted={handleNoteDeleted}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-sm">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                Pick a note
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Select a note on the left or start a new one with the button above the list.
              </p>
              <button
                type="button"
                onClick={handleNewNote}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
              >
                <span className="h-3.5 w-3.5">
                  <PlusIcon />
                </span>
                New note
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

interface NoteListItemProps {
  note: NoteSummary
  selected: boolean
  onOpen: () => void
}

function NoteListItem({ note, selected, onOpen }: NoteListItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={[
          'flex w-full flex-col rounded-md px-2 py-1.5 text-left',
          selected
            ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100'
            : 'text-gray-700 hover:bg-gray-200/60 dark:text-gray-200 dark:hover:bg-gray-800',
        ].join(' ')}
        title={note.title}
      >
        <span className="flex items-center gap-1.5">
          {note.is_pinned && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          <span className="truncate text-xs font-medium">{note.title || 'Untitled note'}</span>
        </span>
        {note.content_preview && (
          <span className="mt-0.5 line-clamp-1 text-[10px] text-gray-500 dark:text-gray-400">
            {note.content_preview}
          </span>
        )}
      </button>
    </li>
  )
}
