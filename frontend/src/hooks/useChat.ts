import { useState, useCallback } from 'react'
import { Message } from '../types/chat'

function makeId(): string {
  return crypto.randomUUID()
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])

  const addMessage = useCallback((role: Message['role'], content: string): Message => {
    const msg: Message = { id: makeId(), role, content, createdAt: new Date() }
    setMessages((prev) => [...prev, msg])
    return msg
  }, [])

  const updateLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      const copy = [...prev]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = { ...copy[i], content }
          break
        }
      }
      return copy
    })
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, addMessage, updateLastAssistantMessage, clearMessages }
}
