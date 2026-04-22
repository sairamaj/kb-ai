import { Suspense, lazy, useEffect, useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { PublicConversationPage } from './components/PublicConversationPage'
import { PublicCollectionPage } from './components/PublicCollectionPage'
import { PublicLearningTopicPage } from './components/PublicLearningTopicPage'

const AppShellV2 = lazy(() => import('./v2/AppShellV2').then((m) => ({ default: m.AppShellV2 })))

type PublicPage =
  | { name: 'public-conversation'; id: string }
  | { name: 'public-collection'; id: string }
  | { name: 'public-learning-topic'; id: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parsePublicPath(pathname: string): PublicPage | null {
  const conv = pathname.match(/^\/c\/(.+)$/)
  if (conv && UUID_RE.test(conv[1])) {
    return { name: 'public-conversation', id: conv[1] }
  }
  const col = pathname.match(/^\/collections\/public\/(.+)$/)
  if (col && UUID_RE.test(col[1])) {
    return { name: 'public-collection', id: col[1] }
  }
  const topic = pathname.match(/^\/learning-topics\/public\/(.+)$/)
  if (topic && UUID_RE.test(topic[1])) {
    return { name: 'public-learning-topic', id: topic[1] }
  }
  return null
}

function AppShellLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
    </div>
  )
}

function AppShell() {
  const [publicPage, setPublicPage] = useState<PublicPage | null>(() =>
    parsePublicPath(window.location.pathname),
  )

  useEffect(() => {
    function onPop() {
      setPublicPage(parsePublicPath(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function leavePublic(target: string) {
    history.pushState({}, '', target)
    setPublicPage(null)
  }

  if (publicPage?.name === 'public-conversation') {
    return (
      <PublicConversationPage
        id={publicPage.id}
        onGoToFeed={() => leavePublic('/feed')}
        onGoToLogin={() => leavePublic('/')}
      />
    )
  }

  if (publicPage?.name === 'public-collection') {
    return (
      <PublicCollectionPage
        id={publicPage.id}
        onGoToFeed={() => leavePublic('/feed')}
        onGoToLogin={() => leavePublic('/')}
        onOpenConversation={(id) => {
          history.pushState({}, '', `/c/${id}`)
          setPublicPage({ name: 'public-conversation', id })
        }}
      />
    )
  }

  if (publicPage?.name === 'public-learning-topic') {
    return (
      <PublicLearningTopicPage
        id={publicPage.id}
        onGoToFeed={() => leavePublic('/feed')}
        onGoToLogin={() => leavePublic('/')}
        onOpenConversation={(id) => {
          history.pushState({}, '', `/c/${id}`)
          setPublicPage({ name: 'public-conversation', id })
        }}
      />
    )
  }

  return (
    <Suspense fallback={<AppShellLoading />}>
      <AppShellV2 />
    </Suspense>
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
