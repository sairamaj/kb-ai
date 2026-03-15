import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './components/ChatPage'
import { ConversationDetailPage } from './components/ConversationDetailPage'
import { LibraryPage } from './components/LibraryPage'
import { PublicConversationPage } from './components/PublicConversationPage'
import { PublicCollectionPage } from './components/PublicCollectionPage'
import { FeedPage } from './components/FeedPage'
import { HelpPopup } from './components/HelpPopup'
import { ReportsPage } from './components/ReportsPage'
import type { Message } from './types/chat'

type AppPage =
  | { name: 'chat'; initialMessages?: Message[]; continuedFromTitle?: string }
  | { name: 'library' }
  | { name: 'conversation'; id: string; from: 'chat' | 'library' }
  | { name: 'public-conversation'; id: string }
  | { name: 'public-collection'; id: string }
  | { name: 'feed' }
  | { name: 'reports' }

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
  if (pathname === '/reports') return { name: 'reports' }
  if (pathname === '/help') return { name: 'chat' }
  return { name: 'chat' }
}

function pageToPath(page: AppPage): string {
  if (page.name === 'public-conversation') return `/c/${page.id}`
  if (page.name === 'public-collection') return `/collections/public/${page.id}`
  if (page.name === 'feed') return '/feed'
  if (page.name === 'reports') return '/reports'
  return '/'
}

function AppShell() {
  const { user, isLoading } = useAuth()
  const [page, setPage] = useState<AppPage>(() => parsePath(window.location.pathname))
  const [helpPopupOpen, setHelpPopupOpen] = useState(false)

  // Sync URL when page changes.
  useEffect(() => {
    const target = pageToPath(page)
    if (window.location.pathname !== target) {
      history.pushState({}, '', target)
    }
  }, [page])

  // Deep-link /help: open help popup and show chat page.
  useEffect(() => {
    if (window.location.pathname === '/help') {
      setHelpPopupOpen(true)
      history.replaceState({}, '', '/')
    }
  }, [])

  // Handle browser back / forward.
  useEffect(() => {
    const handlePop = () => setPage(parsePath(window.location.pathname))
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  // REP-02: Redirect non-admins who hit /reports directly (API would return 403).
  useEffect(() => {
    if (!user || isLoading) return
    if (page.name === 'reports' && user.role !== 'administrator') {
      setPage({ name: 'chat' })
      window.history.replaceState({}, '', '/')
    }
  }, [user, isLoading, page.name])

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
      <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage onGoToFeed={() => setPage({ name: 'feed' })} />

  if (page.name === 'reports' && user.role === 'administrator') {
    return (
      <ReportsPage onBack={() => setPage({ name: 'chat' })} />
    )
  }

  if (page.name === 'reports') {
    return null
  }

  if (page.name === 'library') {
    return (
      <>
        <LibraryPage
          onBack={() => setPage({ name: 'chat' })}
          onOpenConversation={(id) => setPage({ name: 'conversation', id, from: 'library' })}
          onOpenReports={user.role === 'administrator' ? () => setPage({ name: 'reports' }) : undefined}
        />
        <HelpPopup open={helpPopupOpen} onOpen={() => setHelpPopupOpen(true)} onClose={() => setHelpPopupOpen(false)} />
      </>
    )
  }

  if (page.name === 'conversation') {
    const backPage: AppPage = page.from === 'library' ? { name: 'library' } : { name: 'chat' }
    return (
      <>
        <ConversationDetailPage
          id={page.id}
          onBack={() => setPage(backPage)}
          onDeleted={() => setPage(backPage)}
          onContinue={(messages, title) =>
            setPage({ name: 'chat', initialMessages: messages, continuedFromTitle: title })
          }
          onOpenReports={user.role === 'administrator' ? () => setPage({ name: 'reports' }) : undefined}
        />
        <HelpPopup open={helpPopupOpen} onOpen={() => setHelpPopupOpen(true)} onClose={() => setHelpPopupOpen(false)} />
      </>
    )
  }

  // page.name === 'chat'
  const chatPage = page as { name: 'chat'; initialMessages?: Message[]; continuedFromTitle?: string }
  return (
    <>
      <ChatPage
        onOpenConversation={(id: string) => setPage({ name: 'conversation', id, from: 'chat' })}
        onOpenLibrary={() => setPage({ name: 'library' })}
        onOpenReports={user.role === 'administrator' ? () => setPage({ name: 'reports' }) : undefined}
        initialMessages={chatPage.initialMessages}
        continuedFromTitle={chatPage.continuedFromTitle}
      />
      <HelpPopup open={helpPopupOpen} onOpen={() => setHelpPopupOpen(true)} onClose={() => setHelpPopupOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  )
}
