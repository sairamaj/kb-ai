## Chatbot — Phased User Stories

This document defines a phased set of implementation stories for the in-app help chatbot, derived from the chatbot requirements (e.g. `docs/requirements_chatbot.md` or equivalent). Each story is written so it can be handed to an agent for implementation. No code-level details are included; each story focuses on behavior, inputs/outputs, and acceptance criteria.

---

## Phase 1 — Knowledge Source and Backend Contract

### CB-01 — Define and expose the help knowledge content

**Goal:** Establish a single, maintainable knowledge source that the help chatbot uses so answers stay accurate and aligned with official documentation.

**Description:**
- Assemble or generate content suitable for the help bot from existing docs: product vision and features from `docs/requirements.md`; auth API, configurable limits, CLI role script, and DB access from `docs/developer.md`; roles, limits table, and admin capabilities from `docs/authorization.MD`.
- Expose this content in a form the backend can use at runtime (e.g. bundled markdown/text files, or a build-time step that produces a knowledge artifact). The implementation may use RAG over these docs or a curated prompt/knowledge bundle; the story does not prescribe the mechanism.
- Ensure the knowledge source is the single place that defines “what the bot is allowed to say” about the application.

**Behavior:**
- The backend (or a build process) has access to structured or semi-structured help content derived from the listed docs.
- Content covers: what the app is, how to use chat/save/replay/library/collections, roles and limits, visibility, where to find developer/admin info.
- Updates to the source docs can be reflected in the help content via a documented process (e.g. re-run ingestion or rebuild bundle).

**Acceptance Criteria:**
- Given the existing docs (`requirements.md`, `developer.md`, `authorization.MD`), there is a defined path to produce or load help knowledge used by the chatbot.
- Given a review of the knowledge content, it includes product vision, core features, roles, limits (with correct numbers or reference to config), and pointers to developer/admin documentation.
- Given documentation for the feature, the knowledge source and its relationship to the docs are clearly described.

---

### CB-02 — Provide a help-chat API endpoint

**Goal:** Expose a dedicated API for the help chatbot so the frontend can send user questions and receive answers without reusing the main conversation chat endpoint.

**Description:**
- Add a backend endpoint (e.g. `POST /api/help/chat` or similar) that accepts a user message (and optionally a conversation/session identifier for multi-turn).
- The endpoint uses the help knowledge source (from CB-01) and, when implemented, returns a streamed or non-streamed text response suitable for display in the help UI.
- Authentication is optional for this endpoint: if unauthenticated access is supported, the backend must restrict answers to public/product overview and must not include user-specific data (see Phase 4).

**Behavior:**
- When the frontend sends a valid request with a question, the backend responds with a text answer (streamed or full body, per implementation choice).
- The endpoint does not create or modify main-app conversations, collections, or user data; it is read-only for help purposes.
- Unauthenticated requests, if supported, receive only generic/product-level answers; authenticated requests may later receive personalized context (Phase 2).

**Acceptance Criteria:**
- Given a `POST` request to the help-chat endpoint with a message body, the server responds with a success status and a response body or stream containing answer text.
- Given an authenticated request, the endpoint accepts it and can later use the current user for context (Phase 2).
- Given documentation for the API, the endpoint URL, request shape, and response shape are clearly described.
- Given a check of backend behavior, the help endpoint does not create or update conversations, collections, or user records.

---

## Phase 2 — Scope, Grounding, and Optional User Context

### CB-03 — Ground help answers in the knowledge source

**Goal:** Ensure every help response is based on the defined knowledge content so the bot does not invent features, limits, or procedures.

**Description:**
- Implement the logic that combines the user’s question with the help knowledge source (from CB-01) to produce an answer. Use whichever approach fits the stack (e.g. LLM with retrieved chunks, or LLM with a fixed system prompt that includes curated content).
- Answers must be consistent with the docs: correct role names, limit values (or “configurable per deployment”), and feature descriptions. If limit values are configurable, the answer should reflect that (e.g. “Pro users have a configurable limit, often 100 conversations”).

**Behavior:**
- When a user asks a question in scope (e.g. “How do I save a conversation?”, “What are the Starter limits?”), the response is derived from the knowledge source and is accurate.
- The bot does not invent new features or change documented limits; it may summarize or paraphrase the official content.

**Acceptance Criteria:**
- Given a question about a feature described in the docs (e.g. replay mode, collections), when the user sends it to the help endpoint, the answer describes the feature in line with the documentation.
- Given a question about roles or limits, when the user sends it to the help endpoint, the answer uses the correct role names and limit semantics (e.g. Starter lifetime cap vs Pro current total).
- Given a question whose answer is not in the knowledge source, the behavior is covered by CB-04 (out-of-scope handling).

---

### CB-04 — Handle out-of-scope questions with a polite redirect

**Goal:** When the user asks something unrelated to the application (e.g. general knowledge, other products), the bot clearly states its scope and suggests on-topic questions.

**Description:**
- Implement detection of out-of-scope questions (e.g. via prompt instructions, classification step, or LLM judgment). When the question is off-topic, respond with a short, polite message that the bot only answers questions about this application, and suggest example questions (e.g. how to save a conversation, what the Pro plan includes).
- Do not attempt to answer off-topic questions; do not expose internal paths or technical details in the redirect.

**Behavior:**
- When the user asks a question that is clearly not about the Prompt Knowledge Base application, the response is a redirect message and does not contain an attempted answer to the off-topic question.
- The redirect is friendly and points the user toward valid topics.

**Acceptance Criteria:**
- Given a question about general knowledge or another product, when sent to the help endpoint, the response is a polite redirect and does not answer the question as if it were about the app.
- Given a question that is ambiguous, when the response is a redirect, it suggests 1–2 example on-topic questions.
- Given the redirect message, it does not include internal API paths, secrets, or implementation details.

---

### CB-05 — Optional: Inject current user context for authenticated requests

**Goal:** When the user is authenticated, optionally include their role and usage (e.g. conversation/collection counts) so the bot can personalize answers (e.g. “With your Starter plan you can have up to 5 conversations; you currently have 3.”).

**Description:**
- For requests to the help-chat endpoint that include a valid authenticated user, optionally retrieve the user’s role and, where available, current usage (e.g. conversation count, collection count) from existing APIs or services.
- Pass this context to the answer-generation logic so that responses can reference the user’s plan and usage when relevant. Do not include PII or sensitive data beyond role and non-sensitive counts.
- If the backend does not yet expose usage counts, this story can be limited to role-only context.

**Behavior:**
- When an authenticated user asks a question about limits or their plan, the response can reference their actual role and, if available, current usage.
- When an unauthenticated user (or a request without user context) asks the same question, the response is generic (e.g. describes Starter/Pro limits without “your plan”).
- User context is never exposed in the response in raw form (e.g. no “your user id is …”); it is only used to tailor the answer.

**Acceptance Criteria:**
- Given an authenticated user with role `starter`, when they ask “What are my conversation limits?”, the response can mention their plan and, if available, current usage (e.g. “With Starter you can have up to 5 conversations; you currently have 3.”).
- Given an unauthenticated request with the same question, the response describes limits in general terms and does not refer to “your” plan or usage.
- Given any use of user context, only role and non-sensitive usage counts are used; no secrets or internal identifiers are included in the prompt or response.

---

## Phase 3 — In-App Help UI

### CB-06 — Add an entry point to open the help chatbot

**Goal:** Users can discover and open the help chatbot from within the application without leaving the main flow.

**Description:**
- Add at least one in-app entry point for the help chatbot. Options include: a floating button (e.g. “Help” or icon), a link in the header or navigation, or a dedicated route (e.g. `/help`). The exact placement can follow existing UI patterns.
- When the user activates the entry point, the help UI is shown (e.g. a panel, a modal, or a full page). It should be clearly identifiable as “Help” or “App help,” distinct from the main AI chat.

**Behavior:**
- A user can open the help chatbot from the main application UI with one clear action (click or navigation).
- The help experience is visually distinct from the main conversation chat (e.g. different title, icon, or layout) so users understand they are in “application help” mode.

**Acceptance Criteria:**
- Given a logged-in user on any main app screen, they can reach the help chatbot via a visible, documented entry point (button, link, or route).
- Given the help UI is open, it is clear from labels or layout that this is application help, not the main knowledge-base chat.
- Given documentation or UI copy, the entry point is described (e.g. “Click the Help button” or “Go to Help in the menu”).

---

**Implementation (CB-06):** Entry point: **Help** button in the header on Chat, Library, and Conversation detail pages; route `/help`. Help page is labeled **App help** with amber styling and a question-mark icon. See `docs/developer.md` (§ In-app help entry point).

### CB-07 — Provide a chat-style UI for the help chatbot

**Goal:** Users interact with the help bot through a familiar chat interface: message list, input field, and send action.

**Description:**
- Implement a chat-style UI for the help flow: display a list of messages (user and assistant), a text input, and a send control. Reuse or mirror patterns from the main chat where appropriate (e.g. message bubbles, streaming display).
- The UI sends the user’s message to the help-chat API (from CB-02) and displays the response (streamed or full). Optionally show a loading or “typing” state while waiting.
- The UI does not call the main conversation chat endpoint; it only uses the help endpoint.

**Behavior:**
- The user types a question and sends it; the request goes to the help-chat endpoint; the response appears in the message list.
- If the API supports streaming, the response appears incrementally; otherwise it appears when the full response is received.
- The conversation is scoped to the help panel/page; it does not create or load a main-app conversation.

**Acceptance Criteria:**
- Given the help UI is open, the user can type a message and send it; the message appears in the thread and a response from the help API appears in the thread.
- Given the help API returns a stream, the UI shows the response as it streams (or as a single block if the implementation uses a non-streaming response).
- Given a check of network requests, the help UI only calls the help-chat endpoint, not the main chat/conversation endpoint.

---

### CB-08 — Optional: Support multi-turn help conversations

**Goal:** Allow follow-up questions within the same help session so the user can drill down (e.g. “And how do I do that?” or “What about collections?”) without starting over.

**Description:**
- Extend the help-chat API and frontend so that multiple messages in a session can be sent in one request (e.g. full message history or last N turns) or so that the backend maintains a short-lived session for the help conversation. The exact contract (session id, history in request body, or stateless with history) is an implementation choice.
- Ensure the backend uses only the help knowledge source and optional user context; do not mix in the user’s main conversation history.
- If multi-turn is not implemented, the bot may operate in single-turn mode (each request contains only the latest user message); that is acceptable as a v1.

**Behavior:**
- When the user sends a follow-up message in the same help session, the backend receives the prior turns (or session context) and can produce a coherent answer that considers the conversation so far.
- Multi-turn context is limited to the help session; it does not include the user’s saved or active main-app conversations.

**Acceptance Criteria:**
- Given a user who has asked “What is replay mode?” and received an answer, when they ask “How do I open it?” in the same help session, the response is appropriate in context (e.g. explains how to open replay for a conversation).
- Given the help session, the backend does not receive or use messages from the user’s main chat conversations.
- Given documentation, it is clear whether the help bot supports single-turn only or multi-turn, and how to pass session/history if applicable.

---

## Phase 4 — Security and Unauthenticated Access (Optional)

### CB-09 — Ensure responses do not expose sensitive or invented information

**Goal:** The help bot never reveals internal implementation details (e.g. undocumented API paths, secrets) and does not invent features or limits that are not in the knowledge source.

**Description:**
- Apply the same security and accuracy constraints as in the requirements: answers must be grounded in the knowledge source; no exposure of secrets or undocumented internals; when user context is used, only role and non-sensitive usage.
- Add or reuse checks (e.g. prompt instructions, response validation, or review) so that responses stay within the defined scope and do not hallucinate features or numbers.

**Behavior:**
- Responses are consistent with the official docs and config (e.g. limit values from config or “configurable”).
- No response includes API keys, internal paths not in the developer doc, or made-up feature names or limits.

**Acceptance Criteria:**
- Given any help response, it does not contain secrets, API keys, or undocumented internal URLs or paths.
- Given a question about limits, the response uses only documented or configurable values (or states that they are configurable).
- Given a sample of answers about features, they do not describe capabilities that are not present in the knowledge source or product docs.

---

### CB-10 — Restrict unauthenticated help to public/product overview

**Goal:** If the help chatbot is available to unauthenticated users (e.g. on a landing page), restrict answers to general product and feature overview; do not provide user-specific or limit-personalized answers.

**Description:**
- If the help endpoint is callable without authentication, ensure that unauthenticated requests receive only generic answers: product vision, feature list, role names and general limits (e.g. “Starter has a limit of 5 conversations”), and where to find more info. Do not inject “your plan” or “your usage” or any data that would require authentication.
- Authenticated requests may use CB-05 to personalize; unauthenticated requests must not.

**Behavior:**
- When the request has no valid auth, the backend does not attach user context to the answer and responds with public-level information only.
- When the request is authenticated, the backend may attach user context per CB-05 and personalize where appropriate.

**Acceptance Criteria:**
- Given an unauthenticated request to the help-chat endpoint, the response does not refer to “your plan,” “your usage,” or any user-specific data.
- Given an unauthenticated request asking “What are my limits?”, the response describes limits in general (e.g. by role) and does not include personalized counts.
- Given documentation, it is clear whether unauthenticated access is supported and what scope of answers unauthenticated users receive.

---

## Story mapping (quick reference)

| Phase | Story   | Focus |
|-------|---------|--------|
| 1     | CB-01   | Define and expose help knowledge from docs |
| 1     | CB-02   | Help-chat API endpoint (streaming or full response) |
| 2     | CB-03   | Ground answers in knowledge source |
| 2     | CB-04   | Out-of-scope redirect |
| 2     | CB-05   | Optional: authenticated user context (role, usage) |
| 3     | CB-06   | In-app entry point (button, link, or route) |
| 3     | CB-07   | Chat-style UI for help (messages, input, send) |
| 3     | CB-08   | Optional: multi-turn help session |
| 4     | CB-09   | No sensitive or invented information in responses |
| 4     | CB-10   | Unauthenticated access limited to public/product overview |
