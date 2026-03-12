import { useState, useCallback, useEffect, useRef } from 'react'
import { Message } from '../types/chat'

const SYSTEM_PROMPT =
  'You are a knowledgeable assistant helping a developer build their personal knowledge base. ' +
  'Give clear, concise answers. Use markdown formatting (code blocks, bullet points) where it helps readability.'

const DRAFT_KEY = 'kb_draft_conversation'

function makeId(): string {
  return crypto.randomUUID()
}

function loadDraft(): Message[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Array<{ id: string; role: string; content: string; createdAt: string }>
    return parsed.map((m) => ({
      id: m.id,
      role: m.role as Message['role'],
      content: m.content,
      createdAt: new Date(m.createdAt),
    }))
  } catch {
    return []
  }
}

export interface StreamContext {
  messages: Pick<Message, 'role' | 'content'>[]
  systemPrompt?: string
  provider?: 'openai' | 'gemini'
  model?: string
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

  const provider = ctx.provider ?? 'openai'
  const model = ctx.model ?? 'gpt-4o-mini'

  let response: Response
  try {
    response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payload, provider, model }),
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

export function useChat(initialMessages?: Message[]) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      localStorage.removeItem(DRAFT_KEY)
      return initialMessages
    }
    return loadDraft()
  })
  // When true, the effect skips writing to localStorage (used after an explicit save).
  const skipPersistRef = useRef(false)
  // True when the initial state was restored from a non-empty draft.
  const hasDraft = messages.length > 0

  useEffect(() => {
    if (skipPersistRef.current) return
    if (messages.length === 0) {
      localStorage.removeItem(DRAFT_KEY)
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(messages))
    }
  }, [messages])

  const addMessage = useCallback((role: Message['role'], content: string): Message => {
    skipPersistRef.current = false
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

  const clearMessages = useCallback(() => {
    skipPersistRef.current = false
    localStorage.removeItem(DRAFT_KEY)
    setMessages([])
  }, [])

  // Removes the draft from localStorage without clearing the visible messages.
  // Call this after a successful explicit save so a page refresh starts fresh.
  const clearDraft = useCallback(() => {
    skipPersistRef.current = true
    localStorage.removeItem(DRAFT_KEY)
  }, [])

  return { messages, addMessage, appendToLastAssistant, clearMessages, clearDraft, hasDraft }
}
