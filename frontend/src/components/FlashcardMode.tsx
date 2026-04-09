import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface FlashcardQA {
  question: string
  answer: string
}

interface Props {
  topicTitle: string
  cards: FlashcardQA[]
  onExit: () => void
}

export function FlashcardMode({ topicTitle, cards, onExit }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealAnswer, setRevealAnswer] = useState(false)

  const total = cards.length
  const current = total > 0 ? cards[currentIndex] : null
  const progressPct = total > 1 ? (currentIndex / (total - 1)) * 100 : total === 1 ? 100 : 0

  useEffect(() => {
    setRevealAnswer(false)
  }, [currentIndex])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentIndex((i) => Math.min(i + 1, Math.max(total - 1, 0)))
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentIndex((i) => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [total])

  if (total === 0) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-400 px-4 max-w-lg mx-auto text-center">
        <p className="text-base font-medium text-gray-800 dark:text-gray-200">No flashcards yet</p>
        <p className="text-sm leading-relaxed">Generate flashcards from the topic page, then open practice again.</p>
        <button
          type="button"
          onClick={onExit}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors mt-1"
        >
          ← Back to topic
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col h-[100dvh] bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onExit}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
          >
            ← Exit
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded bg-amber-600 flex items-center justify-center shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300 truncate">Flashcards</span>
          </div>
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[40%] text-right" title={topicTitle}>
          {topicTitle}
        </span>
      </header>

      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/50 dark:bg-gray-900/50">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Card {currentIndex + 1} of {total}
            </span>
            <span>{Math.round(progressPct)}% through</span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          {current && (
            <>
              <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50 px-5 py-6 shadow-sm">
                <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-500 mb-2">
                  Question
                </p>
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 prose-p:my-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.question}</ReactMarkdown>
                </div>
              </section>

              {revealAnswer ? (
                <section className="rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 bg-emerald-50/90 dark:bg-emerald-950/30 px-5 py-6 shadow-sm">
                  <p className="text-[10px] uppercase tracking-wide font-semibold text-emerald-800 dark:text-emerald-400 mb-2">
                    Answer
                  </p>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 prose-p:my-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.answer}</ReactMarkdown>
                  </div>
                </section>
              ) : (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setRevealAnswer(true)}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-sm"
                  >
                    Reveal answer
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 px-4 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Previous
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentIndex(0)
                setRevealAnswer(false)
              }}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Back to first card"
            >
              ↺ Restart
            </button>

            {currentIndex < total - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(i + 1, total - 1))}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 transition-colors"
              >
                Next
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onExit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-600 transition-colors"
              >
                Done
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-600">
            Use{' '}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
              ←
            </kbd>{' '}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-mono text-[10px]">
              →
            </kbd>{' '}
            to move between cards
          </p>
        </div>
      </div>
    </div>
  )
}
