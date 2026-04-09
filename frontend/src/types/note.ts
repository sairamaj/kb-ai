export interface NoteSummary {
  id: string
  title: string
  tags: string[]
  content_preview: string
  visibility: 'public' | 'private'
  is_pinned: boolean
  updated_at: string
}

export interface NoteDetail {
  id: string
  title: string
  content: string
  tags: string[]
  visibility: 'public' | 'private'
  is_pinned: boolean
  source_url: string | null
  created_at: string
  updated_at: string
}

export interface CreateNotePayload {
  title: string
  content: string
  tags?: string[]
  visibility?: 'public' | 'private'
}

export interface UpdateNotePayload {
  title?: string
  content?: string
  tags?: string[]
  visibility?: 'public' | 'private'
  is_pinned?: boolean
}
