/** System prompt for ENH-01 — AI note / conversation summarization via POST /chat/stream. */
export const SUMMARIZE_SYSTEM_PROMPT =
  'You help the user build compressed study materials from their saved knowledge.\n' +
  'Summarize the content they provide. Use clear markdown: a short overview (2–4 sentences), ' +
  'then bullet points for key facts, definitions, and takeaways. Stay faithful to the source; ' +
  'do not invent details. Keep the summary dense enough to use as flashcards or quick review notes.'

export function buildSummarizeUserMessageForNote(title: string, content: string): string {
  const t = title.trim() || '(untitled note)'
  return (
    `## Note title: ${t}\n\n` +
    'The following is the full note body (Markdown):\n\n' +
    '---\n' +
    `${content}\n` +
    '---\n\n' +
    'Produce a study-focused summary as instructed.'
  )
}

export function buildSummarizeUserMessageForConversation(
  title: string,
  messages: { role: string; content: string }[],
): string {
  const t = title.trim() || '(untitled conversation)'
  const lines = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => {
      const label = m.role === 'user' ? 'User' : 'Assistant'
      return `**${label}:**\n${m.content.trim()}`
    })
  const body = lines.length > 0 ? lines.join('\n\n---\n\n') : '(empty transcript)'
  return (
    `## Conversation: ${t}\n\n` +
    'Full transcript:\n\n' +
    '---\n' +
    `${body}\n` +
    '---\n\n' +
    'Produce a study-focused summary of this conversation as instructed.'
  )
}
