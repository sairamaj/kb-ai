import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getApiUrl } from '../api/base'
import { streamChatReply } from '../hooks/useChat'
import {
  SUMMARIZE_SYSTEM_PROMPT,
  buildSummarizeUserMessageForNote,
} from '../lib/summarize'
import type { CreateNotePayload, NoteDetail, UpdateNotePayload } from '../types/note'
import { SummarizeWithAiPanel } from './SummarizeWithAiPanel'

interface Props {
  noteId: string | null
  onClose: () => void
  onSaved: (note: NoteDetail, isNew: boolean) => void
  onDeleted: (noteId: string) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type MobilePane = 'editor' | 'preview'
type NoteDraft = {
  title: string
  content: string
  tags: string[]
  visibility: 'public' | 'private'
  is_pinned: boolean
}

function blankDraft(): NoteDraft {
  return {
    title: '',
    content: '',
    tags: [],
    visibility: 'private',
    is_pinned: false,
  }
}

function sameDraft(a: NoteDraft, b: NoteDraft): boolean {
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.visibility === b.visibility &&
    a.is_pinned === b.is_pinned &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, idx) => tag === b.tags[idx])
  )
}

export function NoteEditor({ noteId, onClose, onSaved, onDeleted }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isLoading, setIsLoading] = useState(noteId !== null)
  const [error, setError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loadedNoteId, setLoadedNoteId] = useState<string | null>(noteId)

  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryStreaming, setSummaryStreaming] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [draft, setDraft] = useState(blankDraft())
  const [lastSaved, setLastSaved] = useState(blankDraft())

  const isExisting = loadedNoteId !== null
  const isDirty = useMemo(() => !sameDraft(draft, lastSaved), [draft, lastSaved])

  useEffect(() => {
    let cancelled = false
    setDeleteError(null)
    if (!noteId) {
      setLoadedNoteId(null)
      setDraft(blankDraft())
      setLastSaved(blankDraft())
      setError(null)
      setIsLoading(false)
      setSaveState('idle')
      return () => {
        cancelled = true
      }
    }

    setIsLoading(true)
    setError(null)
    fetch(getApiUrl(`notes/${noteId}`), { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load note (${res.status})`)
        return res.json() as Promise<NoteDetail>
      })
      .then((note) => {
        if (cancelled) return
        const nextDraft: NoteDraft = {
          title: note.title,
          content: note.content,
          tags: note.tags ?? [],
          visibility: note.visibility,
          is_pinned: note.is_pinned,
        }
        setLoadedNoteId(note.id)
        setDraft(nextDraft)
        setLastSaved(nextDraft)
        setSaveState('saved')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load note.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [noteId])

  async function persistDraft() {
    const trimmedTitle = draft.title.trim()
    const tags = draft.tags.map((tag) => tag.trim()).filter(Boolean)
    if (!trimmedTitle || !draft.content.trim()) return
    setSaveState('saving')
    try {
      const payloadBase = {
        title: trimmedTitle,
        content: draft.content,
        tags,
        visibility: draft.visibility,
        is_pinned: draft.is_pinned,
      }
      const isCreate = !loadedNoteId
      const res = await fetch(getApiUrl(isCreate ? 'notes' : `notes/${loadedNoteId}`), {
        method: isCreate ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBase satisfies CreateNotePayload | UpdateNotePayload),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      const saved = (await res.json()) as NoteDetail
      const snapshot: NoteDraft = {
        title: saved.title,
        content: saved.content,
        tags: saved.tags ?? [],
        visibility: saved.visibility,
        is_pinned: saved.is_pinned,
      }
      setLoadedNoteId(saved.id)
      setDraft(snapshot)
      setLastSaved(snapshot)
      setSaveState('saved')
      setError(null)
      onSaved(saved, isCreate)
    } catch (err) {
      setSaveState('error')
      setError(err instanceof Error ? err.message : 'Save failed.')
    }
  }

  useEffect(() => {
    if (!isDirty) return
    if (!draft.title.trim() || !draft.content.trim()) return
    const timer = window.setTimeout(() => {
      void persistDraft()
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [draft, isDirty])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  function requestClose() {
    if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) {
      return
    }
    onClose()
  }

  function applyWrap(prefix: string, suffix = prefix, placeholder = 'text') {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selection = draft.content.slice(start, end) || placeholder
    const updated = `${draft.content.slice(0, start)}${prefix}${selection}${suffix}${draft.content.slice(end)}`
    setDraft((prev) => ({ ...prev, content: updated }))
    window.requestAnimationFrame(() => {
      el.focus()
      const cursor = start + prefix.length + selection.length + suffix.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  function applyLinePrefix(prefix: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = draft.content.slice(start, end)
    const lines = selected.length > 0 ? selected.split('\n') : ['item']
    const block = lines.map((line) => `${prefix}${line}`).join('\n')
    const updated = `${draft.content.slice(0, start)}${block}${draft.content.slice(end)}`
    setDraft((prev) => ({ ...prev, content: updated }))
    window.requestAnimationFrame(() => {
      el.focus()
      const cursor = start + block.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  function addTag() {
    const next = tagInput.trim()
    if (!next || draft.tags.includes(next)) return
    setDraft((prev) => ({ ...prev, tags: [...prev.tags, next] }))
    setTagInput('')
  }

  function removeTag(tag: string) {
    setDraft((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
  }

  const toolbarBtnClass =
    'text-xs font-medium px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 ' +
    'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 ' +
    'hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40'

  async function deleteNote() {
    if (!loadedNoteId) return
    if (!window.confirm('Delete this note permanently?')) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(getApiUrl(`notes/${loadedNoteId}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      onDeleted(loadedNoteId)
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setIsDeleting(false)
    }
  }

  const canSave = Boolean(draft.title.trim() && draft.content.trim())
  const saveDisabled = saveState === 'saving' || !canSave
  const canSummarize = Boolean(draft.content.trim())

  async function runSummarizeNote() {
    if (!canSummarize || summaryStreaming) return
    setSummaryOpen(true)
    setSummaryError(null)
    setSummaryText('')
    setSummaryStreaming(true)
    const userContent = buildSummarizeUserMessageForNote(draft.title, draft.content)
    await streamChatReply(
      {
        messages: [{ role: 'user', content: userContent }],
        systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
        provider: 'openai',
        model: 'gpt-4o-mini',
      },
      (token) => setSummaryText((prev) => prev + token),
      () => setSummaryStreaming(false),
      (err) => {
        setSummaryStreaming(false)
        setSummaryError(err)
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm"
        onClick={requestClose}
        aria-hidden
      />
      <section
        className="relative z-10 ml-auto flex h-full w-full max-w-5xl flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-editor-heading"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="min-w-0">
            <p id="note-editor-heading" className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {isExisting ? 'Edit note' : 'New note'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                  ? 'Saved'
                  : saveState === 'error'
                    ? 'Save failed'
                    : isDirty
                      ? 'Unsaved changes'
                      : 'Draft'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void persistDraft()}
              disabled={saveDisabled}
              className="text-xs font-medium rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveState === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, is_pinned: !prev.is_pinned }))}
              className={`text-xs px-2.5 py-1.5 rounded-lg border ${
                draft.is_pinned
                  ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {draft.is_pinned ? 'Pinned' : 'Pin'}
            </button>
            <button
              type="button"
              onClick={() => void runSummarizeNote()}
              disabled={!canSummarize || summaryStreaming}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {summaryStreaming ? 'Summarizing…' : 'Summarize with AI'}
            </button>
            {isExisting && (
              <button
                type="button"
                onClick={() => {
                  void deleteNote()
                }}
                disabled={isDeleting}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <button
              type="button"
              onClick={requestClose}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
        ) : (
          <div
            className={`flex min-h-0 flex-1 flex-col ${summaryOpen ? 'md:flex-row' : ''}`}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <button type="button" onClick={() => applyWrap('**')} className={toolbarBtnClass}>
                Bold
              </button>
              <button type="button" onClick={() => applyWrap('*')} className={toolbarBtnClass}>
                Italic
              </button>
              <button type="button" onClick={() => applyLinePrefix('## ')} className={toolbarBtnClass}>
                H2
              </button>
              <button type="button" onClick={() => applyLinePrefix('### ')} className={toolbarBtnClass}>
                H3
              </button>
              <button type="button" onClick={() => applyWrap('`')} className={toolbarBtnClass}>
                Code
              </button>
              <button type="button" onClick={() => applyWrap('\n```\n', '\n```\n', 'code')} className={toolbarBtnClass}>
                Code block
              </button>
              <button type="button" onClick={() => applyLinePrefix('- ')} className={toolbarBtnClass}>
                List
              </button>
              <button type="button" onClick={() => applyWrap('[', '](https://example.com)', 'link text')} className={toolbarBtnClass}>
                Link
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">Pane:</span>
                <div className="flex rounded-lg border border-gray-300 p-0.5 dark:border-gray-600 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setMobilePane('editor')}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      mobilePane === 'editor'
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobilePane('preview')}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      mobilePane === 'preview'
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-1 gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 md:grid-cols-3">
              <input
                id="note-title-input"
                type="text"
                name="note-title"
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Note title"
                autoComplete="off"
                className="relative z-10 md:col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">Visibility</span>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      visibility: prev.visibility === 'private' ? 'public' : 'private',
                    }))
                  }
                  className={`text-xs px-2.5 py-1 rounded border ${
                    draft.visibility === 'public'
                      ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/60'
                      : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-700'
                  }`}
                >
                  {draft.visibility === 'public' ? 'Public' : 'Private'}
                </button>
              </div>
              <div className="md:col-span-3">
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {draft.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 rounded-full pl-2 pr-1 py-0.5"
                    >
                      {tag}
                      <button type="button" onClick={() => removeTag(tag)} className="rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800/50 px-1">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                    placeholder="Add tag"
                    className="relative z-10 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="rounded-lg border border-gray-300 bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    Add tag
                  </button>
                </div>
              </div>
            </div>

            {(error || deleteError) && (
              <div className="px-4 pt-3">
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  {deleteError ?? error}
                </p>
              </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-2">
              <div className={`${mobilePane === 'preview' ? 'hidden sm:block' : 'block'} border-r border-gray-200 dark:border-gray-800 min-h-0`}>
                <textarea
                  ref={textareaRef}
                  value={draft.content}
                  onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Write your markdown note..."
                  className="h-full w-full resize-none bg-white p-4 text-sm leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500"
                />
              </div>
              <div className={`${mobilePane === 'editor' ? 'hidden sm:block' : 'block'} min-h-0 overflow-y-auto`}>
                <article className="prose prose-sm max-w-none px-4 py-4 text-gray-900 prose-headings:text-gray-900 prose-p:text-gray-800 dark:prose-invert dark:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-p:text-gray-200">
                  {draft.content.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.content}</ReactMarkdown>
                  ) : (
                    <p className="text-sm text-gray-400">Preview appears here.</p>
                  )}
                </article>
              </div>
            </div>
            </div>
            {summaryOpen && (
              <SummarizeWithAiPanel
                variant="inset"
                onClose={() => setSummaryOpen(false)}
                summaryText={summaryText}
                isStreaming={summaryStreaming}
                error={summaryError}
              />
            )}
          </div>
        )}
      </section>
    </div>
  )
}
