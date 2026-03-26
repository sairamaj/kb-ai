# Learning Topics — User Stories by Phase

This document breaks Learning Topics into small, testable stories that can be implemented and validated one by one.

---

## Phase LT1 — Foundation (Data + Read APIs)

Goal: Introduce the Learning Topic domain model and basic read paths without changing existing conversation behavior.

### TOPIC-01 — Create `LearningTopic` schema
**As a developer**, I want a persisted Learning Topic entity, so that users can organize conversations by topic.

**Acceptance criteria:**
- Migration creates `learning_topics` table with: `id`, `owner_id`, `title`, `description` (optional), `created_at`, `updated_at`.
- `owner_id` references `users.id` with cascade delete.
- Owner-scoped index exists for performant topic listing.

**Validation checklist:**
- Run migrations successfully.
- Verify table and constraints in DB.
- Verify rollback and re-apply migration works cleanly.

### TOPIC-02 — Create topic-conversation join schema with ordering
**As a developer**, I want a join table with position, so that topic conversation order is explicit and replayable.

**Acceptance criteria:**
- Migration creates `learning_topic_conversations` join table with: `learning_topic_id`, `conversation_id`, `position`, timestamps (optional).
- Composite uniqueness blocks duplicate membership (`learning_topic_id`, `conversation_id`).
- Ordering index exists on (`learning_topic_id`, `position`).

**Validation checklist:**
- Add two different conversations to one topic and verify positions.
- Attempt duplicate insert for same topic+conversation and verify failure.
- Verify ordered query by position returns deterministic results.

### TOPIC-03 — List and detail APIs (read-only)
**As a user**, I want to list and open my topics, so that I can see current structure before editing.

**Acceptance criteria:**
- `GET /learning-topics` returns only the authenticated user’s topics.
- `GET /learning-topics/{topic_id}` returns topic metadata and ordered conversations.
- Non-owner access is blocked.

**Validation checklist:**
- Authenticated owner receives topic list/detail.
- Different user receives `403`/`404` based on API policy.
- Empty state works when user has no topics.

---

## Phase LT2 — Topic Lifecycle (Create/Delete)

Goal: Enable basic management of Learning Topics.

### TOPIC-04 — Create topic API + UI
**As a user**, I want to create a learning topic, so that I can start organizing related conversations.

**Acceptance criteria:**
- Create action supports required title and optional description.
- New topic appears immediately in topic list.
- Invalid payloads are rejected with clear error messages.

**Validation checklist:**
- Create topic with minimum fields.
- Create topic with optional description.
- Submit empty title and verify validation error.

### TOPIC-05 — Delete topic API + UI
**As a user**, I want to delete a learning topic, so that I can clean up topics I no longer need.

**Acceptance criteria:**
- Deletion requires confirmation in UI.
- Topic and its memberships are removed.
- Underlying conversations are not deleted.

**Validation checklist:**
- Delete topic with memberships and verify topic disappears.
- Verify linked conversations still exist in library.
- Verify non-owner cannot delete.

---

## Phase LT3 — Membership Management

Goal: Allow users to build and evolve topics over time.

### TOPIC-06 — Add conversations to topic
**As a user**, I want to add saved conversations to a topic, so that I can curate learning material.

**Acceptance criteria:**
- User can add accessible conversations to an existing topic.
- Duplicate membership in the same topic is blocked.
- New membership receives correct position (append to end by default).

**Validation checklist:**
- Add one conversation, then multiple conversations.
- Attempt duplicate add and verify conflict response.
- Verify appended ordering is correct.

### TOPIC-07 — Remove conversations from topic
**As a user**, I want to remove conversations from a topic, so that I can keep topic content relevant.

**Acceptance criteria:**
- User can remove any conversation membership from a topic.
- Removal updates topic detail immediately.
- Remaining positions are normalized or consistently handled by API policy.

**Validation checklist:**
- Remove middle item from ordered list.
- Verify resulting order is deterministic.
- Verify removing non-member returns expected error behavior.

### TOPIC-08 — Continue from existing topic over time
**As a user**, I want to reopen an existing topic later and keep adding conversations, so that learning can evolve incrementally.

**Acceptance criteria:**
- Existing topics remain editable after creation.
- Add flow from topic detail supports repeated use across sessions.
- Newly added conversations appear in topic order and are replay-eligible immediately.

**Validation checklist:**
- Create topic, add conversations, log out/in (or refresh), reopen, add more.
- Verify prior content is preserved and new content appended correctly.

---

## Phase LT4 — Ordering and Replay

Goal: Deliver structured progression and learning playback.

### TOPIC-09 — Reorder conversations in topic
**As a user**, I want to rearrange topic conversations, so that replay follows my preferred learning sequence.

**Acceptance criteria:**
- UI supports reorder interactions.
- API persists new positions safely and transactionally.
- Topic detail reflects updated order on refresh.

**Validation checklist:**
- Move first item to last and verify persistence.
- Execute rapid reorder operations and verify no duplicate positions.
- Validate invalid reorder payloads return errors.

### TOPIC-10 — Topic replay (message-level)
**As a user**, I want to replay all messages across a topic, so that I can review knowledge progressively.

**Acceptance criteria:**
- Replay sequence follows topic conversation order.
- Within each conversation, messages are replayed in chronological order.
- Replay shows progress and supports next/previous navigation.

**Validation checklist:**
- Build topic with multiple conversations and known message counts.
- Verify replay order exactly matches expected sequence.
- Verify progress denominator equals total replayable messages.

---

## Phase LT5 — Limits, Errors, and Hardening

Goal: Align governance with existing conversation limits and ensure robust edge-case behavior.

### TOPIC-11 — Enforce topic limits aligned to conversation policy shape
**As a user**, I want clear enforcement of topic limits, so that behavior is predictable by plan/role.

**Acceptance criteria:**
- Topic creation uses same role-based cap policy pattern as conversations.
- Over-limit create attempts are blocked with consistent API/UI error behavior.
- Limits are applied per user.

**Validation checklist:**
- Seed user at cap and verify create is blocked.
- Lower count below cap and verify create succeeds.
- Verify limits do not affect existing topic read/replay operations.

### TOPIC-12 — Error states and UX polish
**As a user**, I want understandable feedback for failures, so that I can recover quickly.

**Acceptance criteria:**
- Standardized handling for `401`, `403`, `404`, `409`, and validation failures.
- Empty states exist for: no topics, topic with no conversations, replay with no messages.
- User-facing messages are actionable and non-technical.

**Validation checklist:**
- Trigger each major error class intentionally and verify UI behavior.
- Confirm loading, empty, and error states are all represented and testable.

---

## Definition of Done (per story)

- Story acceptance criteria pass.
- Relevant automated tests are added/updated.
- Manual validation checklist is completed.
- No regressions in existing conversation chat/replay/library flows.
- Documentation is updated if API or UX behavior changed.
