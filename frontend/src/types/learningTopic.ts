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

export interface ReorderLearningTopicConversationsPayload {
  conversation_ids: string[]
}

export interface TopicReplayMessagePayload {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface TopicReplayEntry {
  conversation_id: string
  conversation_title: string
  message: TopicReplayMessagePayload
}

export interface TopicReplayResponse {
  topic_id: string
  topic_title: string
  total_messages: number
  items: TopicReplayEntry[]
}

export interface TopicReplayIncrementResponse {
  conversation_replay_counts: { conversation_id: string; replay_count: number }[]
}
