import type { LearningTopicListItem } from '../../../types/learningTopic'

interface Props {
  item: LearningTopicListItem
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

export function TopicResultCard({ item, selected, onOpen }: Props) {
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
          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {item.title}
          </h3>
          {item.description && (
            <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
              {item.description}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
            <span>{item.conversation_count} items</span>
            {item.visibility === 'public' && (
              <span className="text-indigo-500 dark:text-indigo-400">Public</span>
            )}
          </div>
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400">
          {formatDate(item.updated_at)}
        </div>
      </div>
    </button>
  )
}
