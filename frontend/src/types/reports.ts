/**
 * Types for admin reports (REP-03–REP-07).
 * Matches backend UserReportRow and ModelReportRow from app.routers.reports.
 */
export interface UserReportRow {
  id: string
  email: string
  display_name: string
  role: string
  collection_count: number
  conversation_count: number
  /** ISO8601 or null if not tracked. */
  last_accessed_at: string | null
  visit_count: number
}

/** One row in the model and costs report (REP-06, REP-07). */
export interface ModelReportRow {
  model: string
  /** Configured unit cost (USD per 1K tokens); null if not set. */
  cost_per_1k_tokens: number | null
  /** Real spend from provider (e.g. OpenAI) for the period; null if not available (e.g. Gemini). */
  real_cost_usd: number | null
  /** e.g. "Last 30 days" when real_cost_usd is present. */
  cost_period_label: string | null
}
