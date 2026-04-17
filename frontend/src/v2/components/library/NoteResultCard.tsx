import type { NoteSummary } from '../../../types/note'

interface Props {
  item: NoteSummary
  selected: boolean
  onOpen: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function NoteResultCard({ item, selected, onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-900/20'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700 dark:hover:bg-gray-800/50',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {item.is_pinned && (
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full bg-amber-500"
                title="Pinned"
                aria-label="Pinned"
              />
            )}
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              {item.title || 'Untitled note'}
            </h3>
          </div>
          {item.content_preview && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
              {item.content_preview}
            </p>
          )}
          {item.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.tags.slice(0, 5).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                >
                  {t}
                </span>
              ))}
              {item.tags.length > 5 && (
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  +{item.tags.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          <span>{formatDate(item.updated_at)}</span>
          {item.visibility === 'public' && (
            <span className="text-indigo-500 dark:text-indigo-400">Public</span>
          )}
        </div>
      </div>
    </button>
  )
}
