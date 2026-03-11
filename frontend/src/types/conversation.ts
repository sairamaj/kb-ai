export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface ConversationSummary {
  id: string
  title: string
  tags: string[]
  model: string
  visibility: 'public' | 'private'
  message_count: number
  replay_count: number
  created_at: string
  updated_at: string
}

export interface ConversationDetail {
  id: string
  title: string
  tags: string[]
  model: string
  visibility: 'public' | 'private'
  replay_count: number
  created_at: string
  updated_at: string
  messages: ConversationMessage[]
}

export interface UpdateConversationPayload {
  title?: string
  tags?: string[]
  visibility?: 'public' | 'private'
}

export interface PublicConversationDetail {
  id: string
  title: string
  tags: string[]
  model: string
  visibility: 'public' | 'private'
  replay_count: number
  created_at: string
  updated_at: string
  messages: ConversationMessage[]
  author_name: string
  author_avatar: string | null
}

export interface FeedItem {
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

export interface FeedResponse {
  items: FeedItem[]
  total: number
  page: number
  per_page: number
  pages: number
}
