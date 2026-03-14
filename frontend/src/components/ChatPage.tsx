import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChat, streamChatReply } from '../hooks/useChat'
import { useAuth } from '../context/AuthContext'
import { USER_ROLE_LABELS } from '../types/auth'
import { UsageDisplay } from './UsageDisplay'
import { LimitReachedDialog } from './LimitReachedDialog'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { EmptyState } from './EmptyState'
import { TypingIndicator } from './TypingIndicator'
import { SaveDialog } from './SaveDialog'
import { ThemeToggle } from './ThemeToggle'
import type { Message } from '../types/chat'

type ProviderId = 'openai' | 'gemini'

interface ProviderOption {
  id: ProviderId
  label: string
  models: string[]
  enabled: boolean
}

interface ChatSettings {
  provider: ProviderId
  model: string
  systemPrompt: string
  customInstructions: string
  templateId: string
}

const SETTINGS_KEY = 'kb_chat_settings'

const DEFAULT_SYSTEM_PROMPT =
  'You are a knowledgeable assistant helping a developer build their personal knowledge base.\n' +
  'Be practical and precise. Use markdown (headings, bullets, code blocks) where helpful.\n' +
  'When unsure, ask 1–2 clarifying questions before guessing.'

const SAMPLE_CUSTOM_INSTRUCTIONS =
  '- Prefer concise, implementation-first answers.\n' +
  '- When you propose code changes, include a short test plan.\n' +
  '- If you mention an API/library, show a minimal example.\n' +
  '- Avoid long preambles.'

const DEFAULT_PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], enabled: true },
  { id: 'gemini', label: 'Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro'], enabled: true },
]

const TEMPLATES = [
  {
    id: 'general-dev',
    name: 'General dev assistant',
    description: 'Balanced, practical help for building this app.',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    customInstructions: SAMPLE_CUSTOM_INSTRUCTIONS,
    starterPrompts: ['Sketch the data model for conversations + messages.', 'Add an endpoint to stream chat tokens via SSE.'],
  },
  {
    id: 'code-review',
    name: 'Code review (PR-style)',
    description: 'Structured code review with risks and suggestions.',
    systemPrompt:
      'You are a senior engineer performing a PR review.\n' +
      'Be candid but constructive. Focus on correctness, security, performance, and maintainability.\n' +
      'When you suggest changes, show specific code snippets and explain trade-offs.',
    customInstructions:
      '- Format output as:\n' +
      '  - Summary\n' +
      '  - Major issues\n' +
      '  - Minor issues\n' +
      '  - Suggested diff / snippets\n' +
      '  - Test plan\n',
    starterPrompts: ['Review this file for edge cases and security concerns.', 'Suggest refactors to reduce complexity.'],
  },
  {
    id: 'learning-coach',
    name: 'Learning coach',
    description: 'Teach with short lessons + quick checks.',
    systemPrompt:
      'You are a patient teaching assistant.\n' +
      'Explain concepts with a small example, then ask one quick check question.\n' +
      'Keep lessons under ~200 words unless asked to go deeper.',
    customInstructions:
      '- Use analogies sparingly.\n' +
      '- Always end with: "Quick check:" followed by 1 question.\n',
    starterPrompts: ['Teach me how JWT works in this app.', 'Explain Postgres full-text search with tsvector.'],
  },
] as const

interface Props {
  onOpenConversation: (id: string) => void
  onOpenLibrary: () => void
  onOpenHelp: () => void
  initialMessages?: Message[]
  continuedFromTitle?: string
}

export function ChatPage({ onOpenConversation, onOpenLibrary, onOpenHelp, initialMessages, continuedFromTitle }: Props) {
  const queryClient = useQueryClient()
  const { messages, addMessage, appendToLastAssistant, clearMessages, clearDraft, hasDraft } = useChat(initialMessages)
  const { user, logout } = useAuth()
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState<{ message: string; resource: 'conversation' | 'collection' } | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savedConversationId, setSavedConversationId] = useState<string | null>(null)
  const [showDraftNotice, setShowDraftNotice] = useState(hasDraft && !initialMessages?.length)
  const [showContinueBanner, setShowContinueBanner] = useState(!!continuedFromTitle)
  const [showCustomize, setShowCustomize] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>(DEFAULT_PROVIDERS)
  const [settings, setSettings] = useState<ChatSettings>(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) return JSON.parse(raw) as ChatSettings
    } catch {
      // ignore
    }
    return {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      customInstructions: SAMPLE_CUSTOM_INSTRUCTIONS,
      templateId: 'general-dev',
    }
  })
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // ignore
    }
  }, [settings])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/chat/options')
        if (!res.ok) return
        const data = (await res.json()) as { providers?: ProviderOption[] }
        if (!cancelled && data.providers && Array.isArray(data.providers) && data.providers.length > 0) {
          setProviders(data.providers)
        }
      } catch {
        // ignore and keep defaults
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function buildSystemMessage(): string {
    const base = (settings.systemPrompt || '').trim()
    const instr = (settings.customInstructions || '').trim()
    if (!instr) return base
    if (!base) return `Custom instructions:\n${instr}`
    return `${base}\n\nCustom instructions:\n${instr}`
  }

  async function sendWithContext(text: string, contextMessages: Message[]) {
    setError(null)
    const userMessage = addMessage('user', text)
    const context = [...contextMessages, userMessage]
    addMessage('assistant', '')
    setIsStreaming(true)

    await streamChatReply(
      { messages: context, systemPrompt: buildSystemMessage(), provider: settings.provider, model: settings.model },
      (token) => appendToLastAssistant(token),
      () => setIsStreaming(false),
      (err) => {
        setIsStreaming(false)
        setError(err)
      },
    )
  }

  async function handleSend(text: string) {
    await sendWithContext(text, messages)
  }

  function handleNewChat() {
    clearMessages()
    setError(null)
    setIsStreaming(false)
    setSaveSuccess(false)
    setSavedConversationId(null)
    setShowDraftNotice(false)
    setShowContinueBanner(false)
  }

  const defaultTitle = (() => {
    const first = messages.find((m) => m.role === 'user')
    if (!first) return ''
    const t = first.content.slice(0, 80).trim()
    return first.content.length > 80 ? t + '…' : t
  })()

  async function handleSave(title: string, tags: string[]) {
    setIsSaving(true)
    try {
      const systemMessage = buildSystemMessage()
      const modelTag = `${settings.provider}:${settings.model}`
      const payload = {
        title,
        tags,
        messages: [
          ...(systemMessage.trim() ? [{ role: 'system', content: systemMessage }] : []),
          ...messages
            .filter((m) => m.content.trim())
            .map((m) => ({ role: m.role, content: m.content })),
        ],
        model: modelTag,
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
        if (res.status === 403) {
          let detail: string | undefined
          try {
            const data = JSON.parse(text) as { detail?: string }
            detail = typeof data.detail === 'string' ? data.detail : undefined
          } catch {
            detail = text
          }
          if (detail && /limit reached|conversation limit/i.test(detail)) {
            setLimitReached({
              message: detail,
              resource: 'conversation',
            })
            setShowSaveDialog(false)
            setIsSaving(false)
            return
          }
        }
        throw new Error(`Save failed (${res.status}): ${text}`)
      }

      const saved = await res.json() as { id: string }
      queryClient.invalidateQueries({ queryKey: ['me'] })
      clearDraft()
      setShowSaveDialog(false)
      setSaveSuccess(true)
      setSavedConversationId(saved.id)
      setShowDraftNotice(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setShowSaveDialog(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
            KB
          </div>
          <span className="font-semibold text-sm">Prompt KB</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setShowCustomize((v) => !v)}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800"
          >
            Customize
          </button>
          {messages.length > 0 && !isStreaming && (
            <button
              onClick={() => { setSaveSuccess(false); setShowSaveDialog(true) }}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 border border-indigo-300 dark:border-indigo-700 hover:border-indigo-400 dark:hover:border-indigo-500"
            >
              Save
            </button>
          )}
          <button
            onClick={handleNewChat}
            disabled={messages.length === 0}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            New chat
          </button>
          <button
            onClick={onOpenLibrary}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Library
          </button>
          <button
            onClick={onOpenHelp}
            className="text-xs text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800"
            title="Open application help"
          >
            Help
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-800 pl-3 ml-1">
            {user?.usage && (
              <UsageDisplay usage={user.usage} className="hidden sm:inline" />
            )}
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {user?.display_name}
              {user?.role && (
                <span className="ml-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-normal">
                  ({USER_ROLE_LABELS[user.role]})
                </span>
              )}
            </span>
            <button
              onClick={logout}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {showCustomize && (
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/60">
          <div className="max-w-2xl mx-auto px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50/40 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Model</div>
                <div className="text-[11px] text-gray-500">
                  Saved as <span className="text-gray-600 dark:text-gray-400">{settings.provider}:{settings.model}</span>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <select
                  value={settings.provider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as ProviderId
                    const p = providers.find((x) => x.id === nextProvider)
                    const nextModel = p?.models?.[0] ?? (nextProvider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini')
                    setSettings((s) => ({ ...s, provider: nextProvider, model: nextModel }))
                  }}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.enabled}>
                      {p.label}{p.enabled ? '' : ' (not configured)'}
                    </option>
                  ))}
                </select>
                <select
                  value={settings.model}
                  onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {(providers.find((p) => p.id === settings.provider)?.models ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 text-[11px] text-gray-500 leading-relaxed">
                Tip: Gemini requires <span className="text-gray-600 dark:text-gray-400">GEMINI_API_KEY</span> in <span className="text-gray-600 dark:text-gray-400">backend/.env</span>.
              </div>
            </div>

            <div className="bg-gray-50/40 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-xl p-3">
              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Templates</div>
              <div className="mt-2 flex gap-2">
                <select
                  value={settings.templateId}
                  onChange={(e) => setSettings((s) => ({ ...s, templateId: e.target.value }))}
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const t = TEMPLATES.find((x) => x.id === settings.templateId) ?? TEMPLATES[0]
                    setSettings((s) => ({
                      ...s,
                      systemPrompt: t.systemPrompt,
                      customInstructions: t.customInstructions,
                    }))
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors text-white"
                >
                  Apply
                </button>
              </div>
              <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                {(TEMPLATES.find((x) => x.id === settings.templateId) ?? TEMPLATES[0]).description}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(TEMPLATES.find((x) => x.id === settings.templateId) ?? TEMPLATES[0]).starterPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      handleNewChat()
                      void sendWithContext(p, [])
                    }}
                    className="px-2.5 py-1 text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50/40 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-xl p-3 md:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">System prompt (sample included)</div>
                  <textarea
                    value={settings.systemPrompt}
                    onChange={(e) => setSettings((s) => ({ ...s, systemPrompt: e.target.value }))}
                    rows={5}
                    className="mt-2 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Custom instructions (sample included)</div>
                  <textarea
                    value={settings.customInstructions}
                    onChange={(e) => setSettings((s) => ({ ...s, customInstructions: e.target.value }))}
                    rows={5}
                    className="mt-2 w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                These are sent as a single <span className="text-gray-600 dark:text-gray-400">system</span> message on every turn.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {showContinueBanner && continuedFromTitle && (
              <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2">
                <span>
                  Continuing from <span className="font-medium text-indigo-700 dark:text-indigo-300">"{continuedFromTitle}"</span> — new messages will be saved as a new conversation.
                </span>
                <button
                  onClick={() => setShowContinueBanner(false)}
                  className="ml-4 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {showDraftNotice && (
              <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <span>Draft restored — your previous conversation was recovered.</span>
                <button
                  onClick={() => setShowDraftNotice(false)}
                  className="ml-4 text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-300 transition-colors shrink-0"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center justify-between text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                <span>Conversation saved to your knowledge base.</span>
                {savedConversationId && (
                  <button
                    onClick={() => onOpenConversation(savedConversationId)}
                    className="ml-4 text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline underline-offset-2 transition-colors shrink-0"
                  >
                    View / Edit details →
                  </button>
                )}
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
              <TypingIndicator />
            )}
            {error && (
              <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
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
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-2">
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
      {limitReached && (
        <LimitReachedDialog
          message={limitReached.message}
          resource={limitReached.resource}
          onClose={() => setLimitReached(null)}
        />
      )}
    </div>
  )
}
