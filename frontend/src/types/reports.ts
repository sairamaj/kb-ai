/**
 * Types for admin reports (REP-03, REP-04, REP-05).
 * Matches backend UserReportRow from app.routers.reports.
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
