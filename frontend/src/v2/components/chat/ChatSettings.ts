/**
 * Shared chat-settings types + template presets.
 * Persisted to localStorage under `kb_chat_settings`.
 */

export type ProviderId = 'openai' | 'gemini'

export interface ProviderOption {
  id: ProviderId
  label: string
  models: string[]
  enabled: boolean
}

export interface ChatSettings {
  provider: ProviderId
  model: string
  systemPrompt: string
  customInstructions: string
  templateId: string
}

export const SETTINGS_KEY = 'kb_chat_settings'

export const DEFAULT_SYSTEM_PROMPT =
  'You are a knowledgeable assistant helping a developer build their personal knowledge base.\n' +
  'Be practical and precise. Use markdown (headings, bullets, code blocks) where helpful.\n' +
  'When unsure, ask 1–2 clarifying questions before guessing.'

export const SAMPLE_CUSTOM_INSTRUCTIONS =
  '- Prefer concise, implementation-first answers.\n' +
  '- When you propose code changes, include a short test plan.\n' +
  '- If you mention an API/library, show a minimal example.\n' +
  '- Avoid long preambles.'

export const DEFAULT_PROVIDERS: ProviderOption[] = [
  { id: 'openai', label: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'], enabled: true },
  { id: 'gemini', label: 'Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro'], enabled: true },
]

export interface TemplatePreset {
  id: string
  name: string
  description: string
  systemPrompt: string
  customInstructions: string
  starterPrompts: string[]
}

export const TEMPLATES: TemplatePreset[] = [
  {
    id: 'general-dev',
    name: 'General dev assistant',
    description: 'Balanced, practical help for building this app.',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    customInstructions: SAMPLE_CUSTOM_INSTRUCTIONS,
    starterPrompts: [
      'Sketch the data model for conversations + messages.',
      'Add an endpoint to stream chat tokens via SSE.',
    ],
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
    starterPrompts: [
      'Review this file for edge cases and security concerns.',
      'Suggest refactors to reduce complexity.',
    ],
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
    starterPrompts: [
      'Teach me how JWT works in this app.',
      'Explain Postgres full-text search with tsvector.',
    ],
  },
]

export function loadChatSettings(): ChatSettings {
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
}

export function saveChatSettings(s: ChatSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // ignore
  }
}

export function buildSystemMessage(s: ChatSettings): string {
  const base = (s.systemPrompt || '').trim()
  const instr = (s.customInstructions || '').trim()
  if (!instr) return base
  if (!base) return `Custom instructions:\n${instr}`
  return `${base}\n\nCustom instructions:\n${instr}`
}
