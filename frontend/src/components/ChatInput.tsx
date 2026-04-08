import { useState, useRef, KeyboardEvent, useMemo } from 'react'

const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g

function detectUrls(text: string): { urls: string[]; hasYoutube: boolean } {
  const matches = text.match(URL_RE) ?? []
  const urls = [...new Set(matches.map((u) => u.replace(/[.,;:!?"')]+$/, '')))]
  const hasYoutube = urls.some((u) =>
    /^https?:\/\/(?:(?:www\.|m\.)?youtube\.com|youtu\.be)/.test(u),
  )
  return { urls, hasYoutube }
}

interface Props {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Ask anything… (Enter to send, Shift+Enter for new line)' }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { urls, hasYoutube } = useMemo(() => detectUrls(value), [value])
  const hasUrls = urls.length > 0

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  return (
    <div className="flex flex-col gap-1">
      {hasUrls && (
        <div className="flex items-center gap-1.5 px-1 text-xs text-indigo-600 dark:text-indigo-400">
          <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.102-1.101" />
          </svg>
          <span>
            {hasYoutube ? 'YouTube video' : urls.length === 1 ? 'URL' : `${urls.length} URLs`} detected — will summarize with citation
          </span>
        </div>
      )}
      <div className="flex items-end gap-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-2xl px-3 py-2 focus-within:border-indigo-500 transition-colors">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none leading-relaxed max-h-[200px] disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          className="flex-shrink-0 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
