/**
 * Routing for the main app shell. Routes are served at the root.
 * Public share routes (`/c/:id`, `/collections/public/:id`,
 * `/learning-topics/public/:id`) are handled separately in `App.tsx`
 * and never reach this parser.
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

export function parsePathV2(pathname: string): V2Route {
  const stripped = pathname.replace(/\/+$/, '') // trim trailing slash
  const parts = stripped.split('/').filter(Boolean) // remove empty
  const section = parts[0] ?? 'chat'

  if (section === 'library') {
    const tabRaw = parts[1] ?? 'conversations'
    const tab: LibraryTab =
      tabRaw === 'notes' || tabRaw === 'topics' ? tabRaw : 'conversations'
    const selectedId = parts[2]
    if (selectedId && UUID_RE.test(selectedId)) {
      return { name: 'library', tab, selectedId }
    }
    return { name: 'library', tab }
  }

  if (section === 'notes') {
    const noteId = parts[1]
    if (noteId && UUID_RE.test(noteId)) {
      return { name: 'notes', noteId }
    }
    return { name: 'notes' }
  }

  if (section === 'topics') {
    const topicId = parts[1]
    if (topicId && UUID_RE.test(topicId)) {
      return { name: 'topics', topicId }
    }
    return { name: 'topics' }
  }

  if (section === 'feed') return { name: 'feed' }
  if (section === 'reports') return { name: 'reports' }

  if (section === 'chat') {
    const convId = parts[1]
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
      return route.conversationId ? `/chat/${route.conversationId}` : '/'
    case 'library':
      if (route.selectedId) {
        return `/library/${route.tab}/${route.selectedId}`
      }
      return `/library/${route.tab}`
    case 'notes':
      return route.noteId ? `/notes/${route.noteId}` : '/notes'
    case 'topics':
      return route.topicId ? `/topics/${route.topicId}` : '/topics'
    case 'feed':
      return '/feed'
    case 'reports':
      return '/reports'
  }
}

export function routeToSection(route: V2Route): V2Section {
  return route.name
}
