import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChat, streamChatReply, messageFingerprint } from '../../../hooks/useChat'
import { MessageBubble } from '../../../components/MessageBubble'
import { ChatInput } from '../../../components/ChatInput'
import { EmptyState } from '../../../components/EmptyState'
import { TypingIndicator } from '../../../components/TypingIndicator'
import { SaveDialog } from '../../../components/SaveDialog'
import { LimitReachedDialog } from '../../../components/LimitReachedDialog'
import type { Message } from '../../../types/chat'
import type { ConversationDetail } from '../../../types/conversation'
import { getApiUrl } from '../../../api/base'
import { ContextColumn } from '../shell/ContextColumn'
import { PlusIcon } from '../shell/icons'
import { RecentChatsList } from './RecentChatsList'
import { CustomizePopover } from './CustomizePopover'
import {
  DEFAULT_PROVIDERS,
  buildSystemMessage,
  loadChatSettings,
  saveChatSettings,
  type ChatSettings,
  type ProviderOption,
  type TemplatePreset,
} from './ChatSettings'
import type { V2Route } from '../../routing'

interface Props {
  route: Extract<V2Route, { name: 'chat' }>
  navigate: (route: V2Route) => void
  ctxCollapsed: boolean
  onToggleCtx: () => void
}

export function ChatView({ route, navigate, ctxCollapsed, onToggleCtx }: Props) {
  const queryClient = useQueryClient()

  // If a saved conversation is referenced in the URL, load its messages as
  // initial state so the user can continue it from where it left off.
  const [initialMessages, setInitialMessages] = useState<Message[] | undefined>(undefined)
  const [initialTitle, setInitialTitle] = useState<string | undefined>(undefined)
  const [loadingConv, setLoadingConv] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!route.conversationId) {
      setInitialMessages(undefined)
      setInitialTitle(undefined)
      return
    }
    setLoadingConv(true)
    void (async () => {
      try {
        const res = await fetch(getApiUrl(`conversations/${route.conversationId}`), {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        const detail = (await res.json()) as ConversationDetail
        if (cancelled) return
        const msgs: Message[] = detail.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            id: m.id,
            role: m.role as Message['role'],
            content: m.content,
            createdAt: new Date(m.created_at),
          }))
        setInitialMessages(msgs)
        setInitialTitle(detail.title)
      } catch {
        // Fall back to empty chat.
        if (!cancelled) {
          setInitialMessages(undefined)
          setInitialTitle(undefined)
        }
      } finally {
        if (!cancelled) setLoadingConv(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [route.conversationId])

  return (
    <ChatViewInner
      key={route.conversationId ?? 'new'}
      route={route}
      navigate={navigate}
      ctxCollapsed={ctxCollapsed}
      onToggleCtx={onToggleCtx}
      initialMessages={initialMessages}
      initialTitle={initialTitle}
      loadingConv={loadingConv}
      queryClient={queryClient}
    />
  )
}

type ReactQueryClient = ReturnType<typeof useQueryClient>

interface InnerProps extends Props {
  initialMessages: Message[] | undefined
  initialTitle: string | undefined
  loadingConv: boolean
  queryClient: ReactQueryClient
}

function ChatViewInner({
  route,
  navigate,
  ctxCollapsed,
  onToggleCtx,
  initialMessages,
  initialTitle,
  loadingConv,
  queryClient,
}: InnerProps) {
  const {
    messages,
    addMessage,
    appendToLastAssistant,
    clearMessages,
    clearDraft,
    hasDraft,
    draftSaveMeta,
    setDraftSaveMeta,
  } = useChat(initialMessages)

  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState<
    { message: string; resource: 'conversation' | 'collection' } | null
  >(null)

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveDialogDefaults, setSaveDialogDefaults] = useState({ title: '', tags: [] as string[] })
  const [saveSuggestionsLoading, setSaveSuggestionsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savedConversationId, setSavedConversationId] = useState<string | null>(null)

  const [showDraftNotice, setShowDraftNotice] = useState(hasDraft && !initialMessages?.length)
  const [showContinueBanner, setShowContinueBanner] = useState(!!initialTitle)

  const [showCustomize, setShowCustomize] = useState(false)
  const [providers, setProviders] = useState<ProviderOption[]>(DEFAULT_PROVIDERS)
  const [settings, setSettings] = useState<ChatSettings>(loadChatSettings)

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    saveChatSettings(settings)
  }, [settings])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(getApiUrl('chat/options'))
        if (!res.ok) return
        const data = (await res.json()) as { providers?: ProviderOption[] }
        if (!cancelled && data.providers && data.providers.length > 0) {
          setProviders(data.providers)
        }
      } catch {
        // keep defaults
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function sendWithContext(text: string, contextMessages: Message[]) {
    setError(null)
    const userMessage = addMessage('user', text)
    const context = [...contextMessages, userMessage]
    addMessage('assistant', '')
    setIsStreaming(true)

    await streamChatReply(
      {
        messages: context,
        systemPrompt: buildSystemMessage(settings),
        provider: settings.provider,
        model: settings.model,
      },
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
    navigate({ name: 'chat' })
  }

  function handleApplyTemplate(template: TemplatePreset) {
    setSettings((s) => ({
      ...s,
      systemPrompt: template.systemPrompt,
      customInstructions: template.customInstructions,
    }))
  }

  function handleStarterPrompt(prompt: string) {
    setShowCustomize(false)
    handleNewChat()
    // Defer until after the state clear propagates
    setTimeout(() => void sendWithContext(prompt, []), 0)
  }

  const fallbackTitle = useMemo(() => {
    const first = messages.find((m) => m.role === 'user')
    if (!first) return ''
    const t = first.content.slice(0, 80).trim()
    return first.content.length > 80 ? t + '…' : t
  }, [messages])

  async function openSaveDialog() {
    setSaveSuccess(false)
    const fp = messageFingerprint(messages)
    const payloadMessages = messages
      .filter((m) => m.content.trim() && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.content }))

    if (draftSaveMeta && draftSaveMeta.fingerprint === fp) {
      setSaveDialogDefaults({ title: draftSaveMeta.title, tags: draftSaveMeta.tags })
      setSaveSuggestionsLoading(false)
      setShowSaveDialog(true)
      return
    }

    setShowSaveDialog(true)
    setSaveSuggestionsLoading(true)
    setSaveDialogDefaults({ title: fallbackTitle, tags: [] })

    if (payloadMessages.length === 0) {
      setSaveSuggestionsLoading(false)
      return
    }

    try {
      const res = await fetch(getApiUrl('conversations/suggest-save-metadata'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messages: payloadMessages }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { title: string; tags: string[] }
      setSaveDialogDefaults({ title: data.title, tags: data.tags })
      setDraftSaveMeta({ title: data.title, tags: data.tags, fingerprint: fp })
    } catch {
      setSaveDialogDefaults({ title: fallbackTitle, tags: [] })
    } finally {
      setSaveSuggestionsLoading(false)
    }
  }

  async function handleSave(title: string, tags: string[]) {
    setIsSaving(true)
    try {
      const systemMessage = buildSystemMessage(settings)
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
      const res = await fetch(getApiUrl('conversations'), {
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
            setLimitReached({ message: detail, resource: 'conversation' })
            setShowSaveDialog(false)
            setIsSaving(false)
            return
          }
        }
        throw new Error(`Save failed (${res.status}): ${text}`)
      }
      const saved = (await res.json()) as { id: string }
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['v2', 'recent-chats'] })
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
    <>
      <ContextColumn
        title="Chat"
        collapsed={ctxCollapsed}
        onToggleCollapsed={onToggleCtx}
        headerAction={
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
          >
            <span className="h-3.5 w-3.5">
              <PlusIcon />
            </span>
            New chat
          </button>
        }
      >
        <RecentChatsList
          selectedId={route.conversationId}
          onOpen={(id) => navigate({ name: 'chat', conversationId: id })}
        />
      </ContextColumn>

      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Top bar for chat: title, save, new */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-2">
            {initialTitle ? (
              <h1 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {initialTitle}
              </h1>
            ) : (
              <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">New chat</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && !isStreaming && (
              <button
                type="button"
                onClick={() => void openSaveDialog()}
                className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/20"
              >
                Save
              </button>
            )}
            <button
              type="button"
              onClick={handleNewChat}
              disabled={messages.length === 0}
              className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              New chat
            </button>
          </div>
        </header>

        {/* Message thread */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {loadingConv ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {showContinueBanner && initialTitle && (
                <div className="flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-600 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400">
                  <span>
                    Continuing from{' '}
                    <span className="font-medium text-indigo-700 dark:text-indigo-300">
                      "{initialTitle}"
                    </span>{' '}
                    — new messages will be saved as a new conversation.
                  </span>
                  <button
                    onClick={() => setShowContinueBanner(false)}
                    className="ml-4 shrink-0 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}
              {showDraftNotice && (
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                  <span>Draft restored — your previous conversation was recovered.</span>
                  <button
                    onClick={() => setShowDraftNotice(false)}
                    className="ml-4 shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-300"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}
              {saveSuccess && (
                <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                  <span>Conversation saved to your knowledge base.</span>
                  {savedConversationId && (
                    <button
                      onClick={() =>
                        navigate({
                          name: 'library',
                          tab: 'conversations',
                          selectedId: savedConversationId,
                        })
                      }
                      className="ml-4 shrink-0 text-green-700 underline underline-offset-2 hover:text-green-900 dark:text-green-300 dark:hover:text-green-100"
                    >
                      View in Library →
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
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar (with customize popover anchored above) */}
        <div className="relative mx-auto w-full max-w-2xl flex-shrink-0 px-4 pb-4 pt-2">
          <CustomizePopover
            open={showCustomize}
            onClose={() => setShowCustomize(false)}
            settings={settings}
            providers={providers}
            onChange={(updater) => setSettings(updater)}
            onApplyTemplate={handleApplyTemplate}
            onStarterPrompt={handleStarterPrompt}
          />
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <button
              type="button"
              onClick={() => setShowCustomize((v) => !v)}
              className="rounded px-2 py-0.5 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              Customize ({settings.provider}:{settings.model})
            </button>
            <span>Shift+Enter for new line · Enter to send</span>
          </div>
          <div data-v2-chat-input-wrap>
            <ChatInput onSend={handleSend} disabled={isStreaming} />
          </div>
        </div>

        {showSaveDialog && (
          <SaveDialog
            defaultTitle={saveDialogDefaults.title}
            defaultTags={saveDialogDefaults.tags}
            onSave={handleSave}
            onCancel={() => setShowSaveDialog(false)}
            isSaving={isSaving}
            isLoadingSuggestions={saveSuggestionsLoading}
          />
        )}
        {limitReached && (
          <LimitReachedDialog
            message={limitReached.message}
            resource={limitReached.resource}
            onClose={() => setLimitReached(null)}
          />
        )}
      </main>
    </>
  )
}
