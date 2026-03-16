/**
 * API base URL for production (VITE_API_BASE_URL) or dev proxy (/api).
 * In dev, Vite proxies /api to the backend; in production the frontend
 * calls the backend at the configured origin (e.g. https://promptkb-api.azurewebsites.net).
 */
function getApiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL
  if (base && typeof base === 'string') return base.replace(/\/$/, '')
  return ''
}

/**
 * Returns the full URL for an API path (backend path without /api prefix).
 * Example: getApiUrl('auth/me') -> in prod 'https://api.example.com/auth/me', in dev '/api/auth/me'.
 */
export function getApiUrl(path: string): string {
  const base = getApiBase()
  const p = path.startsWith('/') ? path.slice(1) : path
  return base ? `${base}/${p}` : `/api/${p}`
}
