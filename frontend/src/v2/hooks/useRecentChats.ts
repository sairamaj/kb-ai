import { useQuery } from '@tanstack/react-query'
import type { ConversationSummary } from '../../types/conversation'
import { getApiUrl } from '../../api/base'

async function fetchRecentChats(): Promise<ConversationSummary[]> {
  const params = new URLSearchParams()
  params.set('sort', 'recent')
  const res = await fetch(getApiUrl(`conversations?${params.toString()}`), {
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to load recent chats (${res.status})`)
  return (await res.json()) as ConversationSummary[]
}

/**
 * Loads the authenticated user's saved conversations, sorted by most recent first.
 * Used by the Chat sidebar recent list and the command palette.
 */
export function useRecentChats() {
  return useQuery<ConversationSummary[]>({
    queryKey: ['v2', 'recent-chats'],
    queryFn: fetchRecentChats,
    staleTime: 30 * 1000,
  })
}
