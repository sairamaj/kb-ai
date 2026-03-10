export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
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
