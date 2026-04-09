import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface SummarizeWithAiPanelProps {
  onClose: () => void
  summaryText: string
  isStreaming: boolean
  error: string | null
  /** layout: inset in a parent flex row vs fixed drawer over the page */
  variant?: 'inset' | 'drawer'
}

export function SummarizeWithAiPanel({
  onClose,
  summaryText,
  isStreaming,
  error,
  variant = 'inset',
}: SummarizeWithAiPanelProps) {
  const shell =
    variant === 'drawer'
      ? 'fixed inset-0 z-40 flex justify-end bg-transparent md:pl-16'
      : 'flex flex-col border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40 md:border-t-0 md:border-l md:w-96 md:shrink-0'

  const inner =
    variant === 'drawer'
      ? 'relative z-10 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-950'
      : 'flex h-full min-h-[40vh] md:min-h-0 flex-1 flex-col'

  return (
    <div className={shell} role="complementary" aria-label="AI summary">
      {variant === 'drawer' && (
        <button
          type="button"
          className="absolute inset-0 z-0 bg-black/40 backdrop-blur-[1px]"
          onClick={onClose}
          aria-label="Close AI summary"
        />
      )}
      <aside className={inner}>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              AI summary
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Not saved to your library automatically — copy if you want to keep it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {error && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          <div
            className="prose prose-sm max-w-none select-text rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-gray-900 prose-headings:text-gray-900 prose-p:text-gray-800 dark:border-gray-700 dark:bg-gray-900/60 dark:prose-invert dark:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-p:text-gray-200"
            aria-live="polite"
          >
            {summaryText.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
            ) : (
              !isStreaming && (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Run &quot;Summarize with AI&quot; to stream a summary here.
                </p>
              )
            )}
            {isStreaming && (
              <span
                className="ml-0.5 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-indigo-500 align-middle"
                aria-hidden
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
