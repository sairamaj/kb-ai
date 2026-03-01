import { useEffect, useRef, useState } from 'react'
import { useChat, streamChatReply } from '../hooks/useChat'
import { useAuth } from '../context/AuthContext'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { EmptyState } from './EmptyState'
import { TypingIndicator } from './TypingIndicator'
import { SaveDialog } from './SaveDialog'

export function ChatPage() {
  const { messages, addMessage, appendToLastAssistant, clearMessages } = useChat()
  const { user, logout } = useAuth()
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  async function handleSend(text: string) {
    setError(null)
    const userMessage = addMessage('user', text)

    // Snapshot full conversation history + new user message as context.
    // The empty assistant placeholder is added to the UI but excluded from
    // the OpenAI payload (streamChatReply filters empty messages).
    const context = [...messages, userMessage]
    addMessage('assistant', '')
    setIsStreaming(true)

    await streamChatReply(
      { messages: context },
      (token) => appendToLastAssistant(token),
      () => setIsStreaming(false),
      (err) => {
        setIsStreaming(false)
        setError(err)
      },
    )
  }

  function handleNewChat() {
    clearMessages()
    setError(null)
    setIsStreaming(false)
    setSaveSuccess(false)
  }

  // Derive a default title from the first user message.
  const defaultTitle = (() => {
    const first = messages.find((m) => m.role === 'user')
    if (!first) return ''
    const t = first.content.slice(0, 80).trim()
    return first.content.length > 80 ? t + '…' : t
  })()

  async function handleSave(title: string, tags: string[]) {
    setIsSaving(true)
    try {
      const payload = {
        title,
        tags,
        messages: messages
          .filter((m) => m.role !== 'system' && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content })),
        model: 'gpt-4o-mini',
        visibility: 'private',
      }

      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`Save failed (${res.status}): ${text}`)
      }

      setShowSaveDialog(false)
      setSaveSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setShowSaveDialog(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold">
            KB
          </div>
          <span className="font-semibold text-sm">Prompt KB</span>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && !isStreaming && (
            <button
              onClick={() => { setSaveSuccess(false); setShowSaveDialog(true) }}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded hover:bg-gray-800 border border-indigo-700 hover:border-indigo-500"
            >
              Save
            </button>
          )}
          <button
            onClick={handleNewChat}
            disabled={messages.length === 0}
            className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded hover:bg-gray-800"
          >
            New chat
          </button>
          <div className="flex items-center gap-2 border-l border-gray-800 pl-3 ml-1">
            <span className="text-sm text-gray-300">{user?.display_name}</span>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {saveSuccess && (
              <div className="text-xs text-green-400 bg-green-900/20 border border-green-800 rounded-lg px-3 py-2">
                Conversation saved to your knowledge base.
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <TypingIndicator />
            )}
            {error && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 max-w-2xl mx-auto w-full">
        <ChatInput onSend={handleSend} disabled={isStreaming} />
        <p className="text-center text-xs text-gray-600 mt-2">
          Shift+Enter for a new line · Enter to send
        </p>
      </div>

      {showSaveDialog && (
        <SaveDialog
          defaultTitle={defaultTitle}
          onSave={handleSave}
          onCancel={() => setShowSaveDialog(false)}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}
