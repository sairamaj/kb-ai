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

export function HelpChat() {
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

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
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
      <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-gray-200 dark:border-gray-800">
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          placeholder="Ask about the app… (Enter to send, Shift+Enter for new line)"
        />
      </div>
    </>
  )
}
