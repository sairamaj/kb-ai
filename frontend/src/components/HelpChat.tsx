/**
 * Shared help chat body (messages + input + send logic) for popup and full page.
 * CB-07, CB-08: calls POST /api/help/chat with history for multi-turn.
 */
import { useRef, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { TypingIndicator } from './TypingIndicator'
import type { Message } from '../types/chat'

function nextId(): string {
  return `help-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const APP_OVERVIEW = `Prompt Knowledge Base replaces a traditional notes-based knowledge base with saved AI conversations. You chat with an AI assistant, save conversations to your library, and revisit them later—including step-by-step "replay" mode—to rebuild understanding over time. You can organize conversations in collections and share them as public or private.`

const SUGGESTED_PROMPTS = [
  'How do I save a conversation?',
  'What is replay mode and how do I use it?',
  'How do I search or find conversations in the Library?',
  'What are collections and how do I create one?',
  'What are my conversation and collection limits?',
  'How do I make a conversation public or private?',
]

function SuggestedPromptsList({
  onSelect,
  disabled,
  compact = false,
}: {
  onSelect: (prompt: string) => void
  disabled: boolean
  compact?: boolean
}) {
  return (
    <ul className={`flex flex-col gap-2 ${compact ? 'max-h-40 overflow-y-auto' : ''}`}>
      {SUGGESTED_PROMPTS.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            onClick={() => onSelect(prompt)}
            disabled={disabled}
            className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:border-amber-200 dark:hover:border-amber-800 text-gray-700 dark:text-gray-300 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {prompt}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function HelpChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuggestedList, setShowSuggestedList] = useState(false)
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
          next[next.length - 1] = { ...last, content: `Sorry, I couldn't get an answer: ${errMessage}` }
        }
        return next
      })
    } finally {
      setIsLoading(false)
      if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  function handleSelectPrompt(prompt: string) {
    handleSend(prompt)
    setShowSuggestedList(false)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <div className="py-4 text-gray-500 dark:text-gray-400 text-sm">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">Application help</p>
            <div className="mb-4 px-3 py-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/50">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1.5">Brief overview</p>
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{APP_OVERVIEW}</p>
            </div>
            <p className="text-center mb-2">Ask about saving conversations, replay mode, library, collections, or your plan limits.</p>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Suggested questions — click to ask:</p>
            <SuggestedPromptsList onSelect={handleSelectPrompt} disabled={isLoading} />
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
      <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 flex flex-col">
        {messages.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            {showSuggestedList ? (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Suggested questions — select one:</span>
                  <button
                    type="button"
                    onClick={() => setShowSuggestedList(false)}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label="Close suggested questions"
                  >
                    Close
                  </button>
                </div>
                <SuggestedPromptsList onSelect={handleSelectPrompt} disabled={isLoading} compact />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSuggestedList(true)}
                className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-medium"
              >
                Suggested questions…
              </button>
            )}
          </div>
        )}
        <div className="px-3 pb-3 pt-2">
          <ChatInput
            onSend={handleSend}
            disabled={isLoading}
            placeholder="Ask about the app… (Enter to send, Shift+Enter for new line)"
          />
        </div>
      </div>
    </>
  )
}
