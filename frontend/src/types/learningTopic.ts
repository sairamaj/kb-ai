import type { PublicCollectionConversationItem } from './collection'

export interface LearningTopicListItem {
  id: string
  title: string
  description: string | null
  visibility: 'public' | 'private'
  conversation_count: number
  created_at: string
  updated_at: string
  /** False for public topics owned by other users. */
  is_owner?: boolean
  author_name?: string | null
  author_avatar?: string | null
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
  /** ENH-04: set when item has been marked reviewed in this topic */
  reviewed_at?: string | null
  mastery_level?: number
}

export interface LearningTopicItemConversation {
  type: 'conversation'
  conversation_id: string
  position: number
  title: string
  model: string
  tags: string[]
  replay_count: number
  created_at: string
  updated_at: string
  reviewed_at?: string | null
  mastery_level?: number
}

export interface LearningTopicItemNote {
  type: 'note'
  note_id: string
  position: number
  title: string
  content_preview: string
  tags: string[]
  updated_at: string
  reviewed_at?: string | null
  mastery_level?: number
}

export type LearningTopicItem = LearningTopicItemConversation | LearningTopicItemNote

/** ENH-04: counts topic members (conversations + notes), not individual replay messages. */
export interface LearningTopicProgressSummary {
  reviewed: number
  total: number
}

/** ENH-02: AI-generated Q&A pairs stored on the topic. */
export interface LearningTopicFlashcard {
  question: string
  answer: string
}

export interface LearningTopicDetail {
  id: string
  title: string
  description: string | null
  visibility: 'public' | 'private'
  created_at: string
  updated_at: string
  /** ENH-04: reviewed/total topic items (not per-message replay steps). */
  progress?: LearningTopicProgressSummary
  /** Unified position-ordered members (conversations and notes). */
  items?: LearningTopicItem[]
  conversations: LearningTopicConversationMember[]
  /** Saved flashcards; empty array if none. */
  flashcards?: LearningTopicFlashcard[]
}

export interface CreateLearningTopicPayload {
  title: string
  description?: string | null
  visibility?: 'public' | 'private'
}

export interface UpdateLearningTopicPayload {
  visibility?: 'public' | 'private'
}

/** Guest discover feed: paginated public learning topics (GET …/learning-topics/public). */
export interface PublicLearningTopicDiscoveryItem {
  id: string
  title: string
  description: string | null
  /** Number of public conversations in the topic (visible on the public topic page). */
  conversation_count: number
  created_at: string
  updated_at: string
  author_name: string
  author_avatar: string | null
}

export interface PublicLearningTopicDiscoveryResponse {
  items: PublicLearningTopicDiscoveryItem[]
  total: number
  page: number
  per_page: number
  pages: number
}

/** Public topic page (GET …/learning-topics/:id/public); same conversation card shape as public collections. */
export interface PublicLearningTopicDetail {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
  author_name: string
  author_avatar: string | null
  conversations: PublicCollectionConversationItem[]
}

export interface AddConversationToTopicPayload {
  conversation_id: string
}

export interface ReorderLearningTopicConversationsPayload {
  conversation_ids: string[]
}

export interface ReorderLearningTopicItemsPayload {
  items: { type: 'conversation' | 'note'; id: string }[]
}

export interface TopicReplayMessagePayload {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface TopicReplayMessageEntry {
  type: 'message'
  conversation_id: string
  conversation_title: string
  message: TopicReplayMessagePayload
  reviewed_at?: string | null
  mastery_level?: number
}

export interface TopicReplayNoteEntry {
  type: 'note'
  note_id: string
  title: string
  content: string
  reviewed_at?: string | null
  mastery_level?: number
}

export type TopicReplayEntry = TopicReplayMessageEntry | TopicReplayNoteEntry

export interface TopicReplayResponse {
  topic_id: string
  topic_title: string
  total_items: number
  items: TopicReplayEntry[]
}

export interface TopicReplayIncrementResponse {
  conversation_replay_counts: { conversation_id: string; replay_count: number }[]
}

/** ENH-04 */
export interface PatchTopicItemProgressPayload {
  type: 'conversation' | 'note'
  id: string
  reviewed?: boolean
  mastery_level?: number
}
