import { useTheme } from '../../../context/ThemeContext'
import { useAuth } from '../../../context/AuthContext'
import type { V2Section } from '../../routing'
import {
  ChatIcon,
  CommandIcon,
  FeedIcon,
  HelpIcon,
  LibraryIcon,
  MoonIcon,
  NotesIcon,
  ReportsIcon,
  SunIcon,
  TopicsIcon,
} from './icons'

interface Props {
  activeSection: V2Section
  onSelect: (section: V2Section) => void
  onOpenCommand: () => void
  onOpenHelp: () => void
  onOpenUserMenu: () => void
}

interface RailItemProps {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  ariaCurrent?: 'page' | undefined
}

function RailItem({ label, active, onClick, children, ariaCurrent }: RailItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={ariaCurrent}
      title={label}
      className={[
        'group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200/70 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100',
      ].join(' ')}
    >
      <span className="h-5 w-5 block">{children}</span>
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-700 z-50">
        {label}
      </span>
    </button>
  )
}

export function IconRail({ activeSection, onSelect, onOpenCommand, onOpenHelp, onOpenUserMenu }: Props) {
  const { theme, cycleTheme } = useTheme()
  const { user } = useAuth()
  const isAdmin = user?.role === 'administrator'
  const isDark = theme === 'dark'

  const initials = (user?.display_name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-14 flex-col items-center border-r border-gray-200 bg-gray-50 py-3 dark:border-gray-800 dark:bg-gray-950"
    >
      {/* Logo */}
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm">
        KB
      </div>

      {/* Primary sections */}
      <div className="flex flex-col gap-1.5">
        <RailItem
          label="Chat"
          active={activeSection === 'chat'}
          ariaCurrent={activeSection === 'chat' ? 'page' : undefined}
          onClick={() => onSelect('chat')}
        >
          <ChatIcon />
        </RailItem>
        <RailItem
          label="Library"
          active={activeSection === 'library'}
          ariaCurrent={activeSection === 'library' ? 'page' : undefined}
          onClick={() => onSelect('library')}
        >
          <LibraryIcon />
        </RailItem>
        <RailItem
          label="Notes"
          active={activeSection === 'notes'}
          ariaCurrent={activeSection === 'notes' ? 'page' : undefined}
          onClick={() => onSelect('notes')}
        >
          <NotesIcon />
        </RailItem>
        <RailItem
          label="Learning Topics"
          active={activeSection === 'topics'}
          ariaCurrent={activeSection === 'topics' ? 'page' : undefined}
          onClick={() => onSelect('topics')}
        >
          <TopicsIcon />
        </RailItem>
        <RailItem
          label="Feed"
          active={activeSection === 'feed'}
          ariaCurrent={activeSection === 'feed' ? 'page' : undefined}
          onClick={() => onSelect('feed')}
        >
          <FeedIcon />
        </RailItem>
        {isAdmin && (
          <RailItem
            label="Reports"
            active={activeSection === 'reports'}
            ariaCurrent={activeSection === 'reports' ? 'page' : undefined}
            onClick={() => onSelect('reports')}
          >
            <ReportsIcon />
          </RailItem>
        )}
      </div>

      <div className="mt-auto flex flex-col items-center gap-1.5">
        <RailItem
          label="Command palette (Ctrl/Cmd+K)"
          onClick={onOpenCommand}
        >
          <CommandIcon />
        </RailItem>
        <RailItem
          label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={cycleTheme}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </RailItem>
        <RailItem label="Help" onClick={onOpenHelp}>
          <HelpIcon />
        </RailItem>
        {/* User avatar */}
        <button
          type="button"
          onClick={onOpenUserMenu}
          title={user?.display_name ?? 'Account'}
          aria-label="Open user menu"
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-semibold text-white hover:from-indigo-400 hover:to-purple-500 transition-colors"
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.display_name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span>{initials || '?'}</span>
          )}
        </button>
      </div>
    </nav>
  )
}
