import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './components/ChatPage'
import { ConversationDetailPage } from './components/ConversationDetailPage'

type AppPage =
  | { name: 'chat' }
  | { name: 'conversation'; id: string }

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

  if (page.name === 'conversation') {
    return (
      <ConversationDetailPage
        id={page.id}
        onBack={() => setPage({ name: 'chat' })}
      />
    )
  }

  return (
    <ChatPage
      onOpenConversation={(id: string) => setPage({ name: 'conversation', id })}
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
