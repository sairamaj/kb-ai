import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './components/ChatPage'
import { ConversationDetailPage } from './components/ConversationDetailPage'
import { LibraryPage } from './components/LibraryPage'
import { PublicConversationPage } from './components/PublicConversationPage'
import { PublicCollectionPage } from './components/PublicCollectionPage'
import { FeedPage } from './components/FeedPage'
import type { Message } from './types/chat'

type AppPage =
  | { name: 'chat'; initialMessages?: Message[]; continuedFromTitle?: string }
  | { name: 'library' }
  | { name: 'conversation'; id: string; from: 'chat' | 'library' }
  | { name: 'public-conversation'; id: string }
  | { name: 'public-collection'; id: string }
  | { name: 'feed' }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePath(pathname: string): AppPage {
  const publicConvMatch = pathname.match(/^\/c\/(.+)$/)
  if (publicConvMatch && UUID_RE.test(publicConvMatch[1])) {
    return { name: 'public-conversation', id: publicConvMatch[1] }
  }
  const publicColMatch = pathname.match(/^\/collections\/public\/(.+)$/)
  if (publicColMatch && UUID_RE.test(publicColMatch[1])) {
    return { name: 'public-collection', id: publicColMatch[1] }
  }
  if (pathname === '/feed') return { name: 'feed' }
  return { name: 'chat' }
}

function pageToPath(page: AppPage): string {
  if (page.name === 'public-conversation') return `/c/${page.id}`
  if (page.name === 'public-collection') return `/collections/public/${page.id}`
  if (page.name === 'feed') return '/feed'
  return '/'
}

function AppShell() {
  const { user, isLoading } = useAuth()
  const [page, setPage] = useState<AppPage>(() => parsePath(window.location.pathname))

  // Sync URL when page changes.
  useEffect(() => {
    const target = pageToPath(page)
    if (window.location.pathname !== target) {
      history.pushState({}, '', target)
    }
  }, [page])

  // Handle browser back / forward.
  useEffect(() => {
    const handlePop = () => setPage(parsePath(window.location.pathname))
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // ---------------------------------------------------------------------------
  // Public pages — no authentication required
  // ---------------------------------------------------------------------------

  if (page.name === 'public-conversation') {
    return (
      <PublicConversationPage
        id={page.id}
        onGoToFeed={() => setPage({ name: 'feed' })}
        onGoToLogin={() => setPage({ name: 'chat' })}
      />
    )
  }

  if (page.name === 'public-collection') {
    return (
      <PublicCollectionPage
        id={page.id}
        onGoToFeed={() => setPage({ name: 'feed' })}
        onGoToLogin={() => setPage({ name: 'chat' })}
        onOpenConversation={(id) => setPage({ name: 'public-conversation', id })}
      />
    )
  }

  if (page.name === 'feed') {
    return (
      <FeedPage
        onOpenConversation={(id) => setPage({ name: 'public-conversation', id })}
        onGoToLogin={() => setPage({ name: 'chat' })}
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Auth-gated pages
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage onGoToFeed={() => setPage({ name: 'feed' })} />

  if (page.name === 'library') {
    return (
      <LibraryPage
        onBack={() => setPage({ name: 'chat' })}
        onOpenConversation={(id) => setPage({ name: 'conversation', id, from: 'library' })}
      />
    )
  }

  if (page.name === 'conversation') {
    const backPage: AppPage = page.from === 'library' ? { name: 'library' } : { name: 'chat' }
    return (
      <ConversationDetailPage
        id={page.id}
        onBack={() => setPage(backPage)}
        onDeleted={() => setPage(backPage)}
        onContinue={(messages, title) =>
          setPage({ name: 'chat', initialMessages: messages, continuedFromTitle: title })
        }
      />
    )
  }

  // page.name === 'chat'
  const chatPage = page as { name: 'chat'; initialMessages?: Message[]; continuedFromTitle?: string }
  return (
    <ChatPage
      onOpenConversation={(id: string) => setPage({ name: 'conversation', id, from: 'chat' })}
      onOpenLibrary={() => setPage({ name: 'library' })}
      initialMessages={chatPage.initialMessages}
      continuedFromTitle={chatPage.continuedFromTitle}
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
