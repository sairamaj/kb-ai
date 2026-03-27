export interface LearningTopicListItem {
  id: string
  title: string
  description: string | null
  conversation_count: number
  created_at: string
  updated_at: string
}

export interface LearningTopicConversationMember {
  conversation_id: string
  position: number
  title: string
  model: string
  tags: string[]
  replay_count: number
  created_at: string
  updated_at: string
}

export interface LearningTopicDetail {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
  conversations: LearningTopicConversationMember[]
}

export interface CreateLearningTopicPayload {
  title: string
  description?: string | null
}

export interface AddConversationToTopicPayload {
  conversation_id: string
}
