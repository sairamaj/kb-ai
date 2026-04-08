/** GET /search — unified conversations + notes (ENH-06) */
export interface UnifiedSearchItem {
  type: 'conversation' | 'note'
  id: string
  title: string
  tags: string[]
  updated_at: string
  is_pinned: boolean
  visibility: 'public' | 'private'
  /** Full-text rank or semantic similarity */
  score: number | null
  message_count?: number | null
  model?: string | null
  replay_count?: number | null
  content_preview?: string | null
  collection_ids?: string[]
}

export type UnifiedSearchTypeFilter = 'all' | 'conversation' | 'note'
