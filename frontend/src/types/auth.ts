/** User role returned by the backend; matches backend UserRole enum. */
export type UserRole = 'administrator' | 'pro' | 'starter'

/** Human-readable labels for UI. */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  pro: 'Pro',
  starter: 'Starter',
}

export interface AuthUser {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  role: UserRole
}
