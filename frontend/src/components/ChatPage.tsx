import { useEffect, useRef } from 'react'
import { useChat } from '../hooks/useChat'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { EmptyState } from './EmptyState'

export function ChatPage() {
  const { messages, addMessage, clearMessages } = useChat()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend(text: string) {
    addMessage('user', text)
    // CHAT-02 will replace this stub with a real streamed OpenAI call
    addMessage('assistant', '(AI response coming in CHAT-02…)')
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
        <button
          onClick={clearMessages}
          disabled={messages.length === 0}
          className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          New chat
        </button>
      </header>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 max-w-2xl mx-auto w-full">
        <ChatInput onSend={handleSend} />
        <p className="text-center text-xs text-gray-600 mt-2">
          Shift+Enter for a new line · Enter to send
        </p>
      </div>
    </div>
  )
}
