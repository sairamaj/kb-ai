# Prompt Knowledge Base — Learning Topics Requirements

## 1. Product Goal and Terminology

Learning Topics provide a structured way to group related saved conversations (for example, "System Design") and review them progressively. A user can collect conversations under a topic, return later to the same topic to keep adding more conversations over time, reorder them, and replay the combined material as a guided learning sequence.

### Terminology

- **Learning Topic**: A user-owned container for organizing one or more saved conversations around a theme.
- **Topic Membership**: The association between a learning topic and a conversation.
- **Topic Order**: The explicit user-defined sequence of conversations within a learning topic.
- **Topic Replay**: Playback of all messages across conversations in a topic, following topic order.

---

## 2. Functional Requirements

### 2.1 Learning Topic Lifecycle

- **FR-TOPIC-01** A logged-in user can create a learning topic with a required title and optional description.
- **FR-TOPIC-02** A user can view a list of their learning topics.
- **FR-TOPIC-03** A user can open a learning topic detail view showing metadata and included conversations in order.
- **FR-TOPIC-04** A user can delete a learning topic with a confirmation step.
- **FR-TOPIC-05** Deleting a learning topic removes only the topic and topic-membership links, not the underlying conversations.

### 2.2 Conversation Membership and Ordering

- **FR-TOPIC-06** A user can add existing saved conversations to a learning topic.
- **FR-TOPIC-07** A user can remove conversations from a learning topic.
- **FR-TOPIC-08** A conversation may belong to multiple learning topics (many-to-many).
- **FR-TOPIC-09** The same conversation cannot be added twice to the same learning topic.
- **FR-TOPIC-10** A user can reorder conversations within a learning topic.
- **FR-TOPIC-11** Reordering is persisted and reflected in all topic detail and replay operations.
- **FR-TOPIC-11A** A user can reopen any existing learning topic at any time and continue adding conversations without recreating the topic.

### 2.3 Topic Replay

- **FR-TOPIC-12** A user can start replay for a learning topic from the topic detail view.
- **FR-TOPIC-13** Topic replay runs at message-level across all included conversations.
- **FR-TOPIC-14** Replay traversal is deterministic: conversations are processed in topic order, then messages are processed in message chronology within each conversation.
- **FR-TOPIC-15** Replay exposes progress state (current item and total items) for topic-level playback.
- **FR-TOPIC-16** Replay supports manual navigation (next/previous) consistent with existing conversation replay behavior.

### 2.4 Access Control and Ownership

- **FR-TOPIC-17** Learning topics are user-scoped; users can access only their own private topics.
- **FR-TOPIC-18** Create/delete/add/remove/reorder operations require ownership of the learning topic.
- **FR-TOPIC-19** Conversations can be added to a topic only if they are accessible to the acting user.

### 2.5 Limits and Quotas

- **FR-TOPIC-20** Learning topics enforce the same per-user cap model currently used for conversations (same role-based policy shape).
- **FR-TOPIC-21** When topic creation exceeds cap, the API returns a clear error and the UI provides actionable guidance.
- **FR-TOPIC-22** Topic cap enforcement is independent from conversation count (same cap policy type, separate resource class).

---

## 3. Non-Functional Requirements

- **NFR-TOPIC-PERF-01** Topic list and topic detail queries should be owner-scoped and efficiently indexed for expected personal-knowledge-base workloads.
- **NFR-TOPIC-PERF-02** Replay startup should avoid excessive latency when topics contain many conversations by using paged/streamed retrieval patterns where needed.
- **NFR-TOPIC-SEC-01** Topic operations must enforce owner authorization on all protected routes.
- **NFR-TOPIC-DATA-01** Topic ordering and membership integrity must be preserved transactionally during reorder operations.
- **NFR-TOPIC-UX-01** Topic management interactions (add/remove/reorder/delete) should provide immediate feedback and clear empty/error states.

---

## 4. Data Model Additions (High-Level)

### 4.1 New Entity

- **LearningTopic**
  - `id` (UUID v4)
  - `owner_id` (FK User, cascade delete)
  - `title` (required)
  - `description` (optional)
  - `created_at`
  - `updated_at`
  - `replay_count` (optional, if analytics parity with conversation replay is desired)

### 4.2 New Join Entity

- **LearningTopicConversation** (topic-conversation membership)
  - `learning_topic_id` (FK LearningTopic, cascade delete)
  - `conversation_id` (FK Conversation, cascade delete)
  - `position` (integer, required, controls topic ordering)
  - Composite uniqueness: (`learning_topic_id`, `conversation_id`)
  - Ordering index: (`learning_topic_id`, `position`)

---

## 5. API Surface (High-Level)

- `POST /learning-topics` — create topic
- `GET /learning-topics` — list user topics
- `GET /learning-topics/{topic_id}` — topic detail with ordered conversations
- `DELETE /learning-topics/{topic_id}` — delete topic
- `POST /learning-topics/{topic_id}/conversations` — add conversation to topic
- `DELETE /learning-topics/{topic_id}/conversations/{conversation_id}` — remove conversation from topic
- `PATCH /learning-topics/{topic_id}/order` — persist reordered conversation positions
- `GET /learning-topics/{topic_id}/replay` (or equivalent replay start endpoint) — retrieve replay sequence metadata and initial state

Error model expectations:
- `401` for unauthenticated requests
- `403` for unauthorized ownership violations
- `404` for missing resources in accessible scope
- `409` for duplicate topic membership conflicts
- `422` for invalid reorder payloads
- `429` or domain-specific `400` for cap-limit violations (consistent with existing conversation limit policy)

---

## 6. UX Flows (High-Level)

### 6.1 Create and Manage Topic

1. User opens Learning Topics area from Library/navigation.
2. User creates a new topic with title (and optional description).
3. User sees topic detail page with empty state and actions to add conversations.

### 6.2 Add and Reorder Conversations

1. User selects one or more existing conversations to add.
2. Topic detail displays ordered conversation list.
3. User rearranges list order and saves (or auto-persists) positions.
4. Updated order is reflected immediately and retained on reload.
5. On a later visit, user reopens the same topic and adds additional conversations as learning evolves.

### 6.3 Replay Topic

1. User starts Topic Replay from topic detail.
2. System aggregates messages according to topic order and message chronology.
3. User navigates replay with next/previous and sees progress across the full topic sequence.

### 6.4 Delete Topic

1. User chooses delete from topic detail/list.
2. Confirmation explains that conversations themselves are not deleted.
3. Topic disappears from list after successful deletion.

---

## 7. Permissions and Privacy Rules

- Learning topics are private to owner in v1.
- Public sharing/discovery for learning topics is out of scope in this phase.
- Topic membership does not alter underlying conversation visibility settings.
- A private conversation added to a topic remains private under existing conversation rules.

---

## 8. Limits and Quota Behavior

- Topic creation uses the same policy shape as conversation caps (for example, role-based max count).
- Cap checks run at topic creation time.
- If cap is reached:
  - API returns a policy-consistent error response.
  - UI disables or blocks create action with clear guidance.
- No cap is imposed in this phase on conversations per topic unless separately introduced later.

---

## 9. Story List with Acceptance Criteria (MVP Sequence)

### TOPIC-01 — Create and list learning topics
**As a user**, I want to create and see my learning topics, so that I can organize study areas.

**Acceptance criteria:**
- User can create topic with required title.
- Topic appears in user-scoped list.
- Duplicate-title policy is defined (allowed or blocked) and consistently enforced.

### TOPIC-02 — Add and remove conversations in a topic
**As a user**, I want to attach and detach saved conversations, so that I can curate topic content.

**Acceptance criteria:**
- User can add accessible conversations to topic.
- User can remove any member conversation from topic.
- Duplicate membership within same topic is blocked.

### TOPIC-03 — Reorder conversations within a topic
**As a user**, I want to set conversation order, so that playback follows my preferred learning sequence.

**Acceptance criteria:**
- User can change order from topic detail.
- Reordered positions persist across refresh.
- Invalid reorder payloads are rejected safely.

### TOPIC-04 — Replay learning topic (message-level)
**As a user**, I want to replay all topic content as one sequence, so that I can review progressively.

**Acceptance criteria:**
- Replay combines messages across all topic conversations.
- Sequence follows topic order, then per-conversation message chronology.
- Replay supports next/previous and progress indicator.

### TOPIC-05 — Delete learning topic
**As a user**, I want to delete topics I no longer need, so that my workspace remains clean.

**Acceptance criteria:**
- Deletion requires explicit confirmation.
- Topic and memberships are removed.
- Conversations remain intact in the library.

### TOPIC-06 — Enforce topic limits and error states
**As a user**, I want clear feedback when I hit limits, so that I understand how to proceed.

**Acceptance criteria:**
- Topic creation is blocked when cap is exceeded.
- API and UI show consistent, actionable error messaging.
- Limit behavior matches existing conversation cap policy style.

---

## 10. Out of Scope (This Phase)

- Public sharing/discovery feed for learning topics
- Collaborative topics with multiple editors
- Topic-level semantic search/ranking
- Automatic ordering/recommendations
- Cross-topic analytics dashboards

---

## 11. Assumptions and Open Items

### Assumptions

- Conversation replay behavior is a suitable UX baseline for topic replay navigation controls.
- Existing conversation ownership and visibility rules remain the source of truth for conversation access.
- Topic creation limit policy can reuse the same role-policy pattern already used for conversations.

### Open Items (for future decision)

- Whether to track topic replay count in v1 or defer to a later analytics phase.
- Exact UX for reorder persistence (explicit save versus immediate auto-save).
- Whether topic titles must be unique per user.
