import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './components/ChatPage'
import { ConversationDetailPage } from './components/ConversationDetailPage'
import { LibraryPage } from './components/LibraryPage'
import type { Message } from './types/chat'

type AppPage =
  | { name: 'chat'; initialMessages?: Message[]; continuedFromTitle?: string }
  | { name: 'library' }
  | { name: 'conversation'; id: string; from: 'chat' | 'library' }

function AppShell() {
  const { user, isLoading } = useAuth()
  const [page, setPage] = useState<AppPage>({ name: 'chat' })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

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

  // At this point page.name === 'chat' (all other cases returned above)
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
