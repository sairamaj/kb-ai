import { useEffect, useRef } from 'react'
import type { ChatSettings, ProviderId, ProviderOption, TemplatePreset } from './ChatSettings'
import { TEMPLATES } from './ChatSettings'

interface Props {
  open: boolean
  onClose: () => void
  settings: ChatSettings
  providers: ProviderOption[]
  onChange: (update: (prev: ChatSettings) => ChatSettings) => void
  onApplyTemplate: (template: TemplatePreset) => void
  onStarterPrompt: (prompt: string) => void
}

/**
 * Compact popover anchored above the chat input for tweaking model, system
 * prompt, custom instructions, and template.
 */
export function CustomizePopover({
  open,
  onClose,
  settings,
  providers,
  onChange,
  onApplyTemplate,
  onStarterPrompt,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open, onClose])

  if (!open) return null

  const activeTemplate = TEMPLATES.find((t) => t.id === settings.templateId) ?? TEMPLATES[0]

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Customize chat"
      className="absolute bottom-full left-0 right-0 z-20 mx-auto mb-2 w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Customize</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Model */}
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Model</div>
          <div className="mt-2 flex gap-2">
            <select
              value={settings.provider}
              onChange={(e) => {
                const next = e.target.value as ProviderId
                const p = providers.find((x) => x.id === next)
                const firstModel = p?.models?.[0] ?? (next === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini')
                onChange((s) => ({ ...s, provider: next, model: firstModel }))
              }}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.enabled}>
                  {p.label}
                  {p.enabled ? '' : ' (not configured)'}
                </option>
              ))}
            </select>
            <select
              value={settings.model}
              onChange={(e) => onChange((s) => ({ ...s, model: e.target.value }))}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {(providers.find((p) => p.id === settings.provider)?.models ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Template */}
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Template</div>
          <div className="mt-2 flex gap-2">
            <select
              value={settings.templateId}
              onChange={(e) => onChange((s) => ({ ...s, templateId: e.target.value }))}
              className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onApplyTemplate(activeTemplate)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Apply
            </button>
          </div>
          <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            {activeTemplate.description}
          </p>
        </div>

        {/* Prompts */}
        <div className="rounded-lg border border-gray-200 p-3 md:col-span-2 dark:border-gray-800">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                System prompt
              </label>
              <textarea
                value={settings.systemPrompt}
                onChange={(e) => onChange((s) => ({ ...s, systemPrompt: e.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Custom instructions
              </label>
              <textarea
                value={settings.customInstructions}
                onChange={(e) => onChange((s) => ({ ...s, customInstructions: e.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>
        </div>

        {/* Starter prompts */}
        {activeTemplate.starterPrompts.length > 0 && (
          <div className="md:col-span-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Starters
            </div>
            <div className="flex flex-wrap gap-2">
              {activeTemplate.starterPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onStarterPrompt(p)}
                  className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700 hover:border-gray-400 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
