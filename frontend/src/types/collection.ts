export interface CollectionSummary {
  id: string
  name: string
  visibility: 'public' | 'private'
  created_at: string
  /** True when the current user owns this collection; false for public collections from others. */
  is_owner?: boolean
  author_name?: string | null
  author_avatar?: string | null
}

export interface CreateCollectionPayload {
  name: string
  visibility?: 'public' | 'private'
}

export interface UpdateCollectionPayload {
  name?: string
  visibility?: 'public' | 'private'
}

/** Conversation item returned in a public collection (same shape as FeedItem). */
export interface PublicCollectionConversationItem {
  id: string
  title: string
  tags: string[]
  model: string
  message_count: number
  replay_count: number
  created_at: string
  updated_at: string
  author_name: string
  author_avatar: string | null
}

export interface PublicCollectionDetail {
  id: string
  name: string
  created_at: string
  author_name: string
  author_avatar: string | null
  conversations: PublicCollectionConversationItem[]
}
