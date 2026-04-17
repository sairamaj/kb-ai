/**
 * Routing for the v2 shell. All v2 routes are namespaced under `/v2`.
 * Existing public share routes stay in the classic shell and are intentionally
 * not handled here.
 */

export type V2Section = 'chat' | 'library' | 'notes' | 'topics' | 'feed' | 'reports'

export type LibraryTab = 'conversations' | 'notes' | 'topics'

export type V2Route =
  | { name: 'chat'; conversationId?: string }
  | { name: 'library'; tab: LibraryTab; selectedId?: string }
  | { name: 'notes'; noteId?: string }
  | { name: 'topics'; topicId?: string }
  | { name: 'feed' }
  | { name: 'reports' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const V2_PREFIX = '/v2'

export function isV2Path(pathname: string): boolean {
  return pathname === V2_PREFIX || pathname.startsWith(`${V2_PREFIX}/`)
}

export function parsePathV2(pathname: string): V2Route {
  const stripped = pathname.replace(/\/+$/, '') // trim trailing slash
  const parts = stripped.split('/').filter(Boolean) // remove empty
  // parts[0] === 'v2'
  const section = parts[1] ?? 'chat'

  if (section === 'library') {
    const tabRaw = parts[2] ?? 'conversations'
    const tab: LibraryTab =
      tabRaw === 'notes' || tabRaw === 'topics' ? tabRaw : 'conversations'
    const selectedId = parts[3]
    if (selectedId && UUID_RE.test(selectedId)) {
      return { name: 'library', tab, selectedId }
    }
    return { name: 'library', tab }
  }

  if (section === 'notes') {
    const noteId = parts[2]
    if (noteId && UUID_RE.test(noteId)) {
      return { name: 'notes', noteId }
    }
    return { name: 'notes' }
  }

  if (section === 'topics') {
    const topicId = parts[2]
    if (topicId && UUID_RE.test(topicId)) {
      return { name: 'topics', topicId }
    }
    return { name: 'topics' }
  }

  if (section === 'feed') return { name: 'feed' }
  if (section === 'reports') return { name: 'reports' }

  // Default: chat (optionally with conversation id)
  if (section === 'chat') {
    const convId = parts[2]
    if (convId && UUID_RE.test(convId)) {
      return { name: 'chat', conversationId: convId }
    }
    return { name: 'chat' }
  }

  return { name: 'chat' }
}

export function routeToPath(route: V2Route): string {
  switch (route.name) {
    case 'chat':
      return route.conversationId
        ? `${V2_PREFIX}/chat/${route.conversationId}`
        : `${V2_PREFIX}/chat`
    case 'library':
      if (route.selectedId) {
        return `${V2_PREFIX}/library/${route.tab}/${route.selectedId}`
      }
      return `${V2_PREFIX}/library/${route.tab}`
    case 'notes':
      return route.noteId ? `${V2_PREFIX}/notes/${route.noteId}` : `${V2_PREFIX}/notes`
    case 'topics':
      return route.topicId ? `${V2_PREFIX}/topics/${route.topicId}` : `${V2_PREFIX}/topics`
    case 'feed':
      return `${V2_PREFIX}/feed`
    case 'reports':
      return `${V2_PREFIX}/reports`
  }
}

export function routeToSection(route: V2Route): V2Section {
  return route.name
}
