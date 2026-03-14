/**
 * In-app help chatbot UI (CB-06, CB-07, CB-08).
 * Distinct from the main knowledge-base chat: this is application help only.
 * Multi-turn: prior turns are sent as history so follow-ups (e.g. "How do I open it?") are answered in context.
 */
import { useRef, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { TypingIndicator } from './TypingIndicator'
import type { Message } from '../types/chat'

interface Props {
  onBack: () => void
}

function nextId(): string {
  return `help-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function HelpPage({ onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function handleSend(text: string) {
    setError(null)
    const userMsg: Message = {
      id: nextId(),
      role: 'user',
      content: text,
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    const assistantMsg: Message = {
      id: nextId(),
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    }
    setMessages((prev) => [...prev, assistantMsg])
    setIsLoading(true)
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' })

    try {
      // CB-08: Send prior turns so the backend can answer in context (multi-turn).
      const history = messages.map((m) => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/help/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText)
        throw new Error(errText || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as { answer: string }
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: data.answer }
        }
        return next
      })
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Something went wrong.'
      setError(errMessage)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: `Sorry, I couldn’t get an answer: ${errMessage}` }
        }
        return next
      })
    } finally {
      setIsLoading(false)
      if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header — clearly "App help", distinct from main chat */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            ← Back
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-white"
              title="Application help"
              aria-hidden
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">App help</span>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Questions about the app—features, saving, library, collections, plans
        </p>
      </header>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Application help</p>
              <p>Ask about saving conversations, replay mode, library, collections, or your plan limits.</p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && <TypingIndicator />}
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 max-w-2xl mx-auto w-full">
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          placeholder="Ask about the app… (Enter to send, Shift+Enter for new line)"
        />
      </div>
    </div>
  )
}
