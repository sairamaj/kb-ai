import { useEffect, useRef, useState } from 'react'

interface Props {
  defaultTitle: string
  defaultTags: string[]
  onSave: (title: string, tags: string[]) => void
  onCancel: () => void
  isSaving: boolean
  /** When true, title and tags are being loaded from the server (LLM suggestions). */
  isLoadingSuggestions?: boolean
}

export function SaveDialog({
  defaultTitle,
  defaultTags,
  onSave,
  onCancel,
  isSaving,
  isLoadingSuggestions = false,
}: Props) {
  const [title, setTitle] = useState(defaultTitle)
  const [tagsInput, setTagsInput] = useState(() => defaultTags.join(', '))
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(defaultTitle)
    setTagsInput(defaultTags.join(', '))
  }, [defaultTitle, defaultTags])

  useEffect(() => {
    if (!isLoadingSuggestions) {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
  }, [isLoadingSuggestions])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    onSave(title.trim() || defaultTitle, tags)
  }

  const fieldsDisabled = isSaving || isLoadingSuggestions

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-dialog-title"
        aria-busy={isLoadingSuggestions || isSaving}
      >
        <h2 id="save-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Save conversation
        </h2>

        {isLoadingSuggestions && (
          <div
            className="mb-4 flex gap-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/90 dark:bg-indigo-950/40 px-3 py-2.5"
            role="status"
            aria-live="polite"
          >
            <span
              className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border-2 border-indigo-200 border-t-indigo-600 dark:border-indigo-700 dark:border-t-indigo-200 animate-spin"
              aria-hidden
            />
            <div className="min-w-0 text-xs text-indigo-900 dark:text-indigo-100 leading-relaxed">
              <p className="font-medium">Creating a title and tags from your conversation…</p>
              <p className="mt-1 text-indigo-700/90 dark:text-indigo-300/90">
                Save stays disabled until suggestions appear so you don’t save with an empty title by mistake.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1" htmlFor="save-title">
              Title
            </label>
            <input
              id="save-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isLoadingSuggestions ? 'Waiting for suggestion…' : 'Conversation title'}
              className={
                'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 ' +
                (isLoadingSuggestions
                  ? 'animate-pulse bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700')
              }
              disabled={fieldsDisabled}
              aria-describedby={isLoadingSuggestions ? 'save-loading-hint' : undefined}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1" htmlFor="save-tags">
              Tags <span className="text-gray-400 dark:text-gray-600">(comma-separated)</span>
            </label>
            <input
              id="save-tags"
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder={isLoadingSuggestions ? 'Waiting for suggestion…' : 'e.g. python, fastapi, tips'}
              className={
                'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 ' +
                (isLoadingSuggestions
                  ? 'animate-pulse bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700')
              }
              disabled={fieldsDisabled}
              aria-describedby={isLoadingSuggestions ? 'save-loading-hint' : undefined}
            />
          </div>

          <p id="save-loading-hint" className="sr-only">
            {isLoadingSuggestions
              ? 'Title and tags are still being generated. The Save button is disabled until they finish.'
              : ''}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={fieldsDisabled}
              className="min-w-[7.5rem] px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              {isSaving ? 'Saving…' : isLoadingSuggestions ? 'Preparing…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
