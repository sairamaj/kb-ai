import { useState, useCallback } from 'react'
import { Message } from '../types/chat'

const SYSTEM_PROMPT =
  'You are a knowledgeable assistant helping a developer build their personal knowledge base. ' +
  'Give clear, concise answers. Use markdown formatting (code blocks, bullet points) where it helps readability.'

function makeId(): string {
  return crypto.randomUUID()
}

export interface StreamContext {
  messages: Pick<Message, 'role' | 'content'>[]
  systemPrompt?: string
}

// Streams tokens from POST /api/chat/stream.
// Sends the full conversation history so the model maintains multi-turn context.
export async function streamChatReply(
  ctx: StreamContext,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  // Build the message list: system prompt first, then conversation history.
  // Filter out any empty assistant placeholders left by failed previous turns.
  const systemMessage = ctx.systemPrompt ?? SYSTEM_PROMPT
  const history = ctx.messages.filter((m) => m.content.trim().length > 0)
  const payload = [
    { role: 'system', content: systemMessage },
    ...history,
  ]

  let response: Response
  try {
    response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload, model: 'gpt-4o-mini' }),
    })
  } catch {
    onError('Network error — could not reach the server.')
    return
  }

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    onError(`Server error ${response.status}: ${text}`)
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    onError('No response body received.')
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') {
        onDone()
        return
      }
      try {
        const { token } = JSON.parse(payload) as { token: string }
        onToken(token)
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
  onDone()
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])

  const addMessage = useCallback((role: Message['role'], content: string): Message => {
    const msg: Message = { id: makeId(), role, content, createdAt: new Date() }
    setMessages((prev) => [...prev, msg])
    return msg
  }, [])

  const appendToLastAssistant = useCallback((token: string) => {
    setMessages((prev) => {
      const copy = [...prev]
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = { ...copy[i], content: copy[i].content + token }
          return copy
        }
      }
      return copy
    })
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, addMessage, appendToLastAssistant, clearMessages }
}
