import { useEffect, useState } from 'react'
import { ConversationDetail, ConversationMessage } from '../types/conversation'
import { MessageBubble } from './MessageBubble'
import { Message } from '../types/chat'

interface Turn {
  user: ConversationMessage
  assistant: ConversationMessage | null
}

function buildTurns(messages: ConversationMessage[]): Turn[] {
  const turns: Turn[] = []
  const nonSystem = messages.filter((m) => m.role !== 'system')
  let i = 0
  while (i < nonSystem.length) {
    if (nonSystem[i].role === 'user') {
      const user = nonSystem[i]
      const next = nonSystem[i + 1]
      const assistant = next?.role === 'assistant' ? next : null
      turns.push({ user, assistant })
      i += assistant ? 2 : 1
    } else {
      i++
    }
  }
  return turns
}

function toUiMessage(m: ConversationMessage): Message {
  return {
    id: m.id,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: new Date(m.created_at),
  }
}

interface Props {
  conv: ConversationDetail
  onExit: () => void
  onReplayCountUpdated?: (newCount: number) => void
}

export function ReplayMode({ conv, onExit, onReplayCountUpdated }: Props) {
  const turns = buildTurns(conv.messages)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    fetch(`/api/conversations/${conv.id}/replay`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ replay_count: number }>) : null))
      .then((data) => {
        if (data) onReplayCountUpdated?.(data.replay_count)
      })
      .catch(() => undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalTurns = turns.length
  const current = turns[currentIndex]
  const progressPct = totalTurns > 1 ? (currentIndex / (totalTurns - 1)) * 100 : 100

  function goNext() {
    setCurrentIndex((i) => Math.min(i + 1, totalTurns - 1))
  }

  function goPrev() {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [totalTurns])

  if (totalTurns === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-gray-400">
        <p className="text-sm">This conversation has no messages to replay.</p>
        <button
          onClick={onExit}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← Back to conversation
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800"
          >
            ← Exit Replay
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span className="text-sm font-medium text-indigo-300">Replay Mode</span>
          </div>
        </div>
        <span className="text-sm text-gray-400 truncate max-w-xs">{conv.title}</span>
      </header>

      {/* Progress bar */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800/50 bg-gray-900/50">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Turn {currentIndex + 1} of {totalTurns}</span>
            <span>{Math.round(progressPct)}% complete</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {/* Step dots for small turn counts */}
          {totalTurns <= 12 && (
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              {turns.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`rounded-full transition-all duration-200 ${
                    idx === currentIndex
                      ? 'w-2.5 h-2.5 bg-indigo-400'
                      : idx < currentIndex
                      ? 'w-2 h-2 bg-indigo-700 hover:bg-indigo-500'
                      : 'w-2 h-2 bg-gray-700 hover:bg-gray-500'
                  }`}
                  title={`Go to turn ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Turn content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-4">
          <MessageBubble key={current.user.id} message={toUiMessage(current.user)} />
          {current.assistant && (
            <MessageBubble
              key={current.assistant.id}
              message={toUiMessage(current.assistant)}
            />
          )}
          {!current.assistant && (
            <p className="text-xs text-gray-600 text-center italic mt-2">
              No assistant response for this turn.
            </p>
          )}
        </div>
      </div>

      {/* Navigation footer */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/80 px-4 py-4">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          <button
            onClick={() => setCurrentIndex(0)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded hover:bg-gray-800"
            title="Restart from the beginning"
          >
            ↺ Restart
          </button>

          {currentIndex < totalTurns - 1 ? (
            <button
              onClick={goNext}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onExit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-700 text-white hover:bg-emerald-600 transition-colors"
            >
              Done
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-center text-xs text-gray-600">
          Use <kbd className="px-1 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-mono text-[10px]">←</kbd>{' '}
          <kbd className="px-1 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-mono text-[10px]">→</kbd>{' '}
          arrow keys to navigate
        </p>
        </div>
      </div>
    </div>
  )
}
