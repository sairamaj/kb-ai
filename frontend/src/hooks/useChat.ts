import { useState, useCallback, useEffect, useRef } from 'react'
import { Message } from '../types/chat'
import { getApiUrl } from '../api/base'

const SYSTEM_PROMPT =
  'You are a knowledgeable assistant helping a developer build their personal knowledge base. ' +
  'Give clear, concise answers. Use markdown formatting (code blocks, bullet points) where it helps readability.'

const DRAFT_KEY = 'kb_draft_conversation'
const DRAFT_VERSION = 2

export type DraftSaveMeta = {
  title: string
  tags: string[]
  /** Stable fingerprint of message ids when suggestions were generated. */
  fingerprint: string
}

function makeId(): string {
  return crypto.randomUUID()
}

export function messageFingerprint(messages: Message[]): string {
  return messages.map((m) => m.id).join('|')
}

function normalizeMessages(
  parsed: Array<{ id: string; role: string; content: string; createdAt: string }>,
): Message[] {
  return parsed.map((m) => ({
    id: m.id,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: new Date(m.createdAt),
  }))
}

function parseDraft(raw: string | null): { messages: Message[]; saveMeta: DraftSaveMeta | null } {
  if (!raw) return { messages: [], saveMeta: null }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return { messages: normalizeMessages(parsed as Parameters<typeof normalizeMessages>[0]), saveMeta: null }
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'messages' in parsed &&
      Array.isArray((parsed as { messages: unknown }).messages)
    ) {
      const o = parsed as {
        messages: Array<{ id: string; role: string; content: string; createdAt: string }>
        saveMeta?: unknown
      }
      const messages = normalizeMessages(o.messages)
      const fp = messageFingerprint(messages)
      let saveMeta: DraftSaveMeta | null = null
      const sm = o.saveMeta
      if (sm && typeof sm === 'object' && sm !== null) {
        const rec = sm as { title?: unknown; tags?: unknown; fingerprint?: unknown }
        if (
          typeof rec.title === 'string' &&
          Array.isArray(rec.tags) &&
          rec.tags.every((t) => typeof t === 'string') &&
          typeof rec.fingerprint === 'string' &&
          rec.fingerprint === fp
        ) {
          saveMeta = {
            title: rec.title,
            tags: rec.tags as string[],
            fingerprint: rec.fingerprint,
          }
        }
      }
      return { messages, saveMeta }
    }
  } catch {
    // ignore
  }
  return { messages: [], saveMeta: null }
}

function loadInitialState(initialMessages?: Message[]) {
  if (initialMessages && initialMessages.length > 0) {
    localStorage.removeItem(DRAFT_KEY)
    return { messages: initialMessages, saveMeta: null as DraftSaveMeta | null }
  }
  return parseDraft(localStorage.getItem(DRAFT_KEY))
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
    response = await fetch(getApiUrl('chat/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
  const initial = loadInitialState(initialMessages)
  const [messages, setMessages] = useState<Message[]>(() => initial.messages)
  const [draftSaveMeta, setDraftSaveMeta] = useState<DraftSaveMeta | null>(() => initial.saveMeta)
  const skipPersistRef = useRef(false)
  const hasDraft = messages.length > 0

  useEffect(() => {
    setDraftSaveMeta((prev) => {
      if (!prev) return null
      return prev.fingerprint === messageFingerprint(messages) ? prev : null
    })
  }, [messages])

  useEffect(() => {
    if (skipPersistRef.current) return
    if (messages.length === 0) {
      localStorage.removeItem(DRAFT_KEY)
    } else {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          version: DRAFT_VERSION,
          messages,
          saveMeta: draftSaveMeta,
        }),
      )
    }
  }, [messages, draftSaveMeta])

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
    setDraftSaveMeta(null)
    setMessages([])
  }, [])

  const clearDraft = useCallback(() => {
    skipPersistRef.current = true
    localStorage.removeItem(DRAFT_KEY)
    setDraftSaveMeta(null)
  }, [])

  return {
    messages,
    addMessage,
    appendToLastAssistant,
    clearMessages,
    clearDraft,
    hasDraft,
    draftSaveMeta,
    setDraftSaveMeta,
  }
}
