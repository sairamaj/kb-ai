import { Suspense, lazy, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { LoginPage } from '../pages/LoginPage'
import { HelpPopup } from '../components/HelpPopup'
import { IconRail } from './components/shell/IconRail'
import { UserMenu } from './components/shell/UserMenu'
import { Placeholder } from './components/shell/Placeholder'
import { useV2Route } from './hooks/useV2Route'
import type { V2Section } from './routing'

const ChatView = lazy(() =>
  import('./components/chat/ChatView').then((m) => ({ default: m.ChatView })),
)
const LibraryView = lazy(() =>
  import('./components/library/LibraryView').then((m) => ({ default: m.LibraryView })),
)
const NotesView = lazy(() =>
  import('./components/notes/NotesView').then((m) => ({ default: m.NotesView })),
)
const TopicsView = lazy(() =>
  import('./components/topics/TopicsView').then((m) => ({ default: m.TopicsView })),
)
const FeedView = lazy(() =>
  import('./components/feed/FeedView').then((m) => ({ default: m.FeedView })),
)
const ReportsView = lazy(() =>
  import('./components/reports/ReportsView').then((m) => ({ default: m.ReportsView })),
)
const CommandPalette = lazy(() =>
  import('./components/shell/CommandPalette').then((m) => ({ default: m.CommandPalette })),
)

function LoadingMain() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  )
}

export function AppShellV2() {
  const { user, isLoading } = useAuth()
  const { route, navigate } = useV2Route()

  const [ctxCollapsed, setCtxCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  // Admin-only guard for reports (mirrors classic shell behaviour).
  useEffect(() => {
    if (!user || isLoading) return
    if (route.name === 'reports' && user.role !== 'administrator') {
      navigate({ name: 'chat' })
    }
  }, [user, isLoading, route.name, navigate])

  // Keyboard shortcuts: Ctrl/Cmd+K (palette), Ctrl/Cmd+B (collapse),
  // Ctrl/Cmd+N (context-aware new), `/` (focus search / chat input).
  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    function focusFirst(selectors: string[]) {
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel)
        if (el) {
          el.focus()
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            try {
              el.select()
            } catch {
              /* ignore */
            }
          }
          return true
        }
      }
      return false
    }

    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((v) => !v)
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setCtxCollapsed((v) => !v)
      } else if (mod && e.key.toLowerCase() === 'n') {
        if (isEditable(e.target)) return
        e.preventDefault()
        if (route.name === 'notes') {
          navigate({ name: 'notes' })
        } else if (route.name === 'topics') {
          navigate({ name: 'topics' })
        } else {
          navigate({ name: 'chat' })
        }
      } else if (e.key === '/' && !isEditable(e.target) && !commandOpen) {
        if (focusFirst(['[data-v2-search]', '[data-v2-chat-input-wrap] textarea'])) {
          e.preventDefault()
        }
      } else if (e.key === 'Escape') {
        setCommandOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route.name, navigate, commandOpen])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage onGoToFeed={() => navigate({ name: 'feed' })} />
  }

  const activeSection: V2Section = route.name

  function handleSelectSection(section: V2Section) {
    if (section === 'reports' && user?.role !== 'administrator') return
    switch (section) {
      case 'chat':
        navigate({ name: 'chat' })
        break
      case 'library':
        navigate({ name: 'library', tab: 'conversations' })
        break
      case 'notes':
        navigate({ name: 'notes' })
        break
      case 'topics':
        navigate({ name: 'topics' })
        break
      case 'feed':
        navigate({ name: 'feed' })
        break
      case 'reports':
        navigate({ name: 'reports' })
        break
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <IconRail
        activeSection={activeSection}
        onSelect={handleSelectSection}
        onOpenCommand={() => setCommandOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onOpenUserMenu={() => setUserMenuOpen((v) => !v)}
      />

      <Suspense fallback={<LoadingMain />}>
        {route.name === 'chat' && (
          <ChatView
            route={route}
            navigate={navigate}
            ctxCollapsed={ctxCollapsed}
            onToggleCtx={() => setCtxCollapsed((v) => !v)}
          />
        )}
        {route.name === 'library' && (
          <LibraryView
            route={route}
            navigate={navigate}
            ctxCollapsed={ctxCollapsed}
            onToggleCtx={() => setCtxCollapsed((v) => !v)}
          />
        )}
        {route.name === 'notes' && (
          <NotesView
            route={route}
            navigate={navigate}
            ctxCollapsed={ctxCollapsed}
            onToggleCtx={() => setCtxCollapsed((v) => !v)}
          />
        )}
        {route.name === 'topics' && (
          <TopicsView
            route={route}
            navigate={navigate}
            ctxCollapsed={ctxCollapsed}
            onToggleCtx={() => setCtxCollapsed((v) => !v)}
          />
        )}
        {route.name === 'feed' && <FeedView navigate={navigate} />}
        {route.name === 'reports' && user.role === 'administrator' && (
          <ReportsView navigate={navigate} />
        )}
        {route.name === 'reports' && user.role !== 'administrator' && (
          <Placeholder title="Reports are admin only" />
        )}
      </Suspense>

      <UserMenu open={userMenuOpen} onClose={() => setUserMenuOpen(false)} />
      <HelpPopup open={helpOpen} onOpen={() => setHelpOpen(true)} onClose={() => setHelpOpen(false)} />
      {commandOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={commandOpen}
            onClose={() => setCommandOpen(false)}
            navigate={navigate}
          />
        </Suspense>
      )}
    </div>
  )
}
