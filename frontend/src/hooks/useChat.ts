import { useState, useCallback } from 'react'
import { Message } from '../types/chat'

function makeId(): string {
  return crypto.randomUUID()
}

// Streams tokens from POST /api/chat/stream, calling onToken for each chunk
// and onDone when the stream closes.
export async function streamChatReply(
  messages: Pick<Message, 'role' | 'content'>[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  console.log('[stream] sending request, messages:', messages.length)
  let response: Response
  try {
    response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        model: 'gpt-4o-mini',
      }),
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
  let tokenCount = 0

  console.log('[stream] reader started')

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      console.log('[stream] reader done, tokens received:', tokenCount)
      break
    }

    const chunk = decoder.decode(value, { stream: true })
    console.log('[stream] raw chunk:', JSON.stringify(chunk))
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') {
        console.log('[stream] [DONE] received, calling onDone')
        onDone()
        return
      }
      try {
        const { token } = JSON.parse(payload) as { token: string }
        tokenCount++
        console.log('[stream] token #' + tokenCount + ':', JSON.stringify(token))
        onToken(token)
      } catch (e) {
        console.warn('[stream] failed to parse line:', line, e)
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
          const updated = { ...copy[i], content: copy[i].content + token }
          copy[i] = updated
          console.log('[state] assistant content now:', JSON.stringify(updated.content.slice(-30)))
          return copy
        }
      }
      console.warn('[state] appendToLastAssistant: no assistant message found in', prev.length, 'messages')
      return copy
    })
  }, [])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, addMessage, appendToLastAssistant, clearMessages }
}
