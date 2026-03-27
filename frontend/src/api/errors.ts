/**
 * User-facing messages for API failures (TOPIC-12).
 * Parses FastAPI `detail` (string or validation array) and maps HTTP status codes.
 */

export interface UserFacingApiErrorOptions {
  /** When status is 404 and `detail` is missing */
  notFound?: string
  /** When status is 403 and `detail` is missing */
  forbidden?: string
  /** When status is 409 and `detail` is missing */
  conflict?: string
}

type ValidationErr = { loc?: unknown[]; msg?: string }

function humanizeFieldName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function labelFromLoc(loc: unknown[] | undefined): string | null {
  if (!Array.isArray(loc) || loc.length === 0) return null
  for (let i = loc.length - 1; i >= 0; i--) {
    const part = loc[i]
    if (typeof part === 'string' && part !== 'body') return humanizeFieldName(part)
  }
  return null
}

/**
 * Parse FastAPI error body: `{ detail: string | ValidationErr[] }`.
 */
export function parseFastApiDetail(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  if (Array.isArray(detail)) {
    const parts: string[] = []
    for (const item of detail) {
      if (typeof item === 'object' && item !== null && 'msg' in item) {
        const e = item as ValidationErr
        const msg = typeof e.msg === 'string' ? e.msg : null
        if (!msg) continue
        const label = labelFromLoc(e.loc)
        parts.push(label ? `${label}: ${msg}` : msg)
      }
    }
    return parts.length ? parts.join(' ') : null
  }
  return null
}

export async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

/**
 * Combine HTTP status, optional FastAPI `detail`, and fallbacks into one message.
 */
export function userFacingApiError(
  status: number,
  body: unknown,
  options: UserFacingApiErrorOptions = {},
): string {
  const parsed = parseFastApiDetail(body)

  if (status === 401) {
    return 'Your session expired. Sign in again to continue.'
  }

  if (parsed) {
    if (status === 403 || status === 404 || status === 409 || status === 400) {
      return parsed
    }
    if (status === 422) {
      return parsed
    }
    if (status >= 400 && status < 500) {
      return parsed
    }
  }

  if (status === 403) {
    return (
      options.forbidden ??
      "You can't do that with your current plan or permissions. Try something else or upgrade your plan."
    )
  }
  if (status === 404) {
    return options.notFound ?? "We couldn't find that. It may have been removed."
  }
  if (status === 409) {
    return (
      options.conflict ??
      'That action conflicts with the current state. Refresh the page and try again.'
    )
  }
  if (status === 422) {
    return 'Check the form and try again.'
  }
  if (status >= 500) {
    return 'Something went wrong on our side. Try again in a moment.'
  }
  return parsed ?? 'Something went wrong. Try again in a moment.'
}
