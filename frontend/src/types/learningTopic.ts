export interface LearningTopicListItem {
  id: string
  title: string
  description: string | null
  conversation_count: number
  created_at: string
  updated_at: string
}

export interface CreateLearningTopicPayload {
  title: string
  description?: string | null
}
