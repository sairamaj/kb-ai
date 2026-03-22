import { createContext, useContext, ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthUser } from '../types/auth'
import { getApiUrl } from '../api/base'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  logout: () => Promise<void>
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchMe(): Promise<AuthUser> {
  // After OAuth, backend redirects with #oauth-complete so the first credentialed
  // cross-origin fetch can run after the browser finishes storing the cookie.
  if (typeof window !== 'undefined') {
    const frag = window.location.hash.replace(/^#/, '')
    if (frag === 'oauth-complete') {
      await new Promise((r) => setTimeout(r, 250))
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
  }
  const res = await fetch(getApiUrl('auth/me'), { credentials: 'include' })
  if (!res.ok) throw new Error('Not authenticated')
  return res.json()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  async function logout() {
    await fetch(getApiUrl('auth/logout'), { method: 'POST', credentials: 'include' })
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
    window.location.href = '/'
  }

  async function deleteAccount() {
    const res = await fetch(getApiUrl('auth/account'), { method: 'DELETE', credentials: 'include' })
    if (!res.ok) throw new Error(`Delete failed (${res.status})`)
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
