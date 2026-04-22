import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { USER_ROLE_LABELS } from '../../../types/auth'
import { UsageDisplay } from '../../../components/UsageDisplay'
import { LogoutIcon } from './icons'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * User menu popover triggered from the icon rail avatar.
 * Surfaces display name, role, usage, plan limits, sign out,
 * and delete account.
 */
export function UserMenu({ open, onClose }: Props) {
  const { user, logout, deleteAccount } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open, onClose])

  if (!open || !user) return null

  async function handleDeleteAccount() {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteAccount()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed.')
      setIsDeleting(false)
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="User menu"
      className="fixed bottom-4 left-16 z-40 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900"
    >
      <div className="flex items-center gap-3">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-semibold text-white">
            {(user.display_name || '?').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {user.display_name}
          </div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/70">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Plan
        </span>
        <span className="text-xs text-gray-800 dark:text-gray-200">
          {USER_ROLE_LABELS[user.role]}
        </span>
      </div>

      {user.usage && (
        <div className="mt-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
          <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Usage
          </div>
          <UsageDisplay usage={user.usage} compact={false} className="mt-1" />
        </div>
      )}

      <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-800">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <span className="h-3.5 w-3.5">
            <LogoutIcon />
          </span>
          Sign out
        </button>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-800">
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete account…
          </button>
        ) : (
          <div className="rounded-md bg-red-50 p-2 dark:bg-red-900/20">
            <div className="text-xs text-red-700 dark:text-red-300">
              Delete your account and all data? This cannot be undone.
            </div>
            {deleteError && (
              <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">{deleteError}</div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void handleDeleteAccount()}
                disabled={isDeleting}
                className="rounded bg-red-600 px-2 py-1 text-[11px] text-white hover:bg-red-500 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={isDeleting}
                className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
