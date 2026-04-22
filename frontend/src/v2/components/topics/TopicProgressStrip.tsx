import type { LearningTopicDetail } from '../../../types/learningTopic'

interface Props {
  detail: LearningTopicDetail
}

function progressFromDetail(detail: LearningTopicDetail): { reviewed: number; total: number } {
  if (detail.progress) return detail.progress
  const items = detail.items ?? detail.conversations.map(() => ({ reviewed_at: null }))
  const reviewed = items.filter(
    (it) => (it as { reviewed_at?: string | null }).reviewed_at != null &&
      (it as { reviewed_at?: string | null }).reviewed_at !== '',
  ).length
  return { reviewed, total: items.length }
}

/**
 * Compact "study progress" strip for the learning-topic detail pane.
 */
export function TopicProgressStrip({ detail }: Props) {
  const tp = progressFromDetail(detail)
  const pct = tp.total > 0 ? Math.round((tp.reviewed / tp.total) * 100) : 0
  return (
    <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/25">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-emerald-900 dark:text-emerald-200">Study progress</span>
        <span className="tabular-nums text-emerald-800 dark:text-emerald-300">
          {tp.reviewed} of {tp.total} items reviewed ({pct}%)
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-200/80 dark:bg-emerald-900/50">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
