import type { UsageInfo } from '../types/auth'

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
  const isUnlimited = usage.conversations_limit === null && usage.collections_limit === null

  if (compact) {
    return (
      <span
        className={`text-[11px] text-gray-500 dark:text-gray-400 ${className}`}
        title="Conversations and collections usage for your plan"
      >
        {isUnlimited ? (
          'Unlimited'
        ) : (
          <>
            {convText} conv · {collText} coll
          </>
        )}
      </span>
    )
  }

  return (
    <div className={`text-xs text-gray-600 dark:text-gray-400 space-y-0.5 ${className}`}>
      <div>Conversations: {convText}</div>
      <div>Collections: {collText}</div>
    </div>
  )
}
