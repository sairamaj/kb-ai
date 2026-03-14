/** User role returned by the backend; matches backend UserRole enum. */
export type UserRole = 'administrator' | 'pro' | 'starter'

/** Human-readable labels for UI. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  pro: 'Pro',
  starter: 'Starter',
}

/** Usage vs limits (AUTHZ-12). null limit = unlimited. */
export interface UsageInfo {
  conversations_used: number
  conversations_limit: number | null
  collections_used: number
  collections_limit: number | null
}

export interface AuthUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  role: UserRole
  /** Present when authenticated; used for plan/limit display. */
  usage?: UsageInfo
}
