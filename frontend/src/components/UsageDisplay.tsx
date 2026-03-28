import type { UsageInfo } from '../types/auth'
import { SHOW_COLLECTIONS_IN_UI } from '../config/features'

interface Props {
  usage: UsageInfo
  /** Compact: single line (e.g. "4/5 conv · 2/5 coll"). Default true. */
  compact?: boolean
  className?: string
}

function formatLimit(used: number, limit: number | null): string {
  if (limit === null) return 'Unlimited'
  return `${used}/${limit}`
}

export function UsageDisplay({ usage, compact = true, className = '' }: Props) {
  const convText = formatLimit(usage.conversations_used, usage.conversations_limit)
  const collText = formatLimit(usage.collections_used, usage.collections_limit)
  const topicText = formatLimit(usage.learning_topics_used, usage.learning_topics_limit)
  const isUnlimited =
    usage.conversations_limit === null &&
    (!SHOW_COLLECTIONS_IN_UI || usage.collections_limit === null) &&
    usage.learning_topics_limit === null

  if (compact) {
    return (
      <span
        className={`text-[11px] text-gray-500 dark:text-gray-400 ${className}`}
        title={
          SHOW_COLLECTIONS_IN_UI
            ? 'Conversations, collections, and learning topics usage for your plan'
            : 'Conversations and learning topics usage for your plan'
        }
      >
        {isUnlimited ? (
          'Unlimited'
        ) : (
          <>
            {convText} conv
            {SHOW_COLLECTIONS_IN_UI && (
              <>
                {' '}
                · {collText} coll
              </>
            )}{' '}
            · {topicText} topics
          </>
        )}
      </span>
    )
  }

  return (
    <div className={`text-xs text-gray-600 dark:text-gray-400 space-y-0.5 ${className}`}>
      <div>Conversations: {convText}</div>
      {SHOW_COLLECTIONS_IN_UI && <div>Collections: {collText}</div>}
      <div>Learning topics: {topicText}</div>
    </div>
  )
}
