import { useEffect, useRef, useState } from 'react'
import { TagIcon } from '../shell/icons'

export type SortOption = 'recent' | 'oldest' | 'most_replayed'
export type SearchMode = 'keyword' | 'semantic'
export type SearchScope = 'tab' | 'all'

export interface LibraryFilters {
  searchMode: SearchMode
  searchScope: SearchScope
  sort: SortOption
  tags: string[]
}

interface Props {
  filters: LibraryFilters
  onChange: (next: LibraryFilters) => void
  allTags: string[]
  /** Only conversations support sort/semantic; notes & topics don't. */
  showSort?: boolean
  showSearchMode?: boolean
  showSearchScope?: boolean
  showTags?: boolean
}

const SORT_LABELS: Record<SortOption, string> = {
  recent: 'Most Recent',
  oldest: 'Oldest',
  most_replayed: 'Most Replayed',
}

export function FilterDrawer({
  filters,
  onChange,
  allTags,
  showSort = true,
  showSearchMode = true,
  showSearchScope = true,
  showTags = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const activeCount =
    (filters.searchMode !== 'keyword' ? 1 : 0) +
    (filters.searchScope !== 'tab' ? 1 : 0) +
    (filters.sort !== 'recent' ? 1 : 0) +
    filters.tags.length

  function toggleTag(tag: string) {
    const next = filters.tags.includes(tag)
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag]
    onChange({ ...filters, tags: next })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
          activeCount > 0
            ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800',
        ].join(' ')}
      >
        <span className="h-3.5 w-3.5">
          <TagIcon />
        </span>
        Filters
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-800 dark:bg-gray-900">
          {showSearchMode && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Search mode
              </div>
              <div className="flex gap-1">
                {(['keyword', 'semantic'] as SearchMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange({ ...filters, searchMode: m })}
                    className={[
                      'rounded px-2.5 py-1 text-xs capitalize',
                      filters.searchMode === m
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                    ].join(' ')}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showSearchScope && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Search scope
              </div>
              <div className="flex gap-1">
                {(['tab', 'all'] as SearchScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ ...filters, searchScope: s })}
                    className={[
                      'rounded px-2.5 py-1 text-xs capitalize',
                      filters.searchScope === s
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                    ].join(' ')}
                  >
                    {s === 'tab' ? 'This tab' : 'All content'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showSort && (
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Sort
              </div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ ...filters, sort: s })}
                    className={[
                      'rounded px-2.5 py-1 text-xs',
                      filters.sort === s
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                    ].join(' ')}
                  >
                    {SORT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showTags && allTags.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Tags
              </div>
              <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                {allTags.map((tag) => {
                  const active = filters.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={[
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        active
                          ? 'border-indigo-500 bg-indigo-100 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800',
                      ].join(' ')}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {activeCount > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-2 dark:border-gray-800">
              <button
                type="button"
                onClick={() =>
                  onChange({ searchMode: 'keyword', searchScope: 'tab', sort: 'recent', tags: [] })
                }
                className="text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
