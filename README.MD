# Prompt Knowledge Base

Prompt Knowledge Base is a web app where you can chat with an AI assistant, save conversations to your personal knowledge base, replay them step-by-step for review, and organize content with tags and collections.

## Instructions, custom instructions, and system prompts

This app lets you control **how the assistant behaves** using *instructions*. You’ll typically see two scopes:

- **Global (default) instructions**: apply to all new conversations unless overridden.
- **Per-conversation instructions**: apply only to one conversation and take precedence over global defaults.

### What’s the difference?

- **Custom instructions (what you edit in the app)**  
  These are **your preferences** for how the assistant should respond (tone, structure, level of detail, default assumptions). The app stores these and sends them with each request.

- **System prompt (how the app enforces instructions)**  
  The system prompt is a **high-priority control message** included with your chat request. It sets the assistant’s role and “always true” rules.  
  The app may implement your custom instructions by injecting them into the system prompt (or an equivalent high-priority instruction block).

In short: **custom instructions are the feature you configure; the system prompt is one mechanism the app uses to apply them reliably.**

### When should I use global vs per-conversation instructions?

- **Use global instructions** when you want a consistent default across the app:
  - Preferred tone (concise, direct, friendly)
  - Default output format (bullets, checklists, tables, “include a test plan”)
  - Your baseline context (tech stack, skill level, constraints)

- **Use per-conversation instructions** when the current chat needs a different “mode”:
  - “Act as a code reviewer” for one thread
  - “Teach me step-by-step” for a learning thread
  - “Generate only SQL queries” for a database thread

### How to write good instructions

- **Be specific about output**: format, length, and what to include/exclude.
- **State constraints**: languages/frameworks, time, environment, APIs, security constraints.
- **Set a role if helpful**: reviewer, tutor, pair programmer, product manager.
- **Avoid contradictions**: conflicting instructions cause unpredictable results.
- **Keep it short**: a few clear bullets usually work better than paragraphs.

### Examples you can paste

**Concise engineering assistant (global):**

- Keep answers under 10 bullets.
- Prefer TypeScript + React examples.
- When giving changes, include a short test plan.

**Per-conversation: “code review mode”:**

- Review my changes for correctness, security, and maintainability.
- Call out risks and propose minimal diffs.
- If you’re unsure, ask a single focused question.

**Per-conversation: “learning mode”:**

- Explain step-by-step with small examples.
- Pause after each step with a quick check question.

### Important note about priority

If a later message conflicts with earlier instructions, the assistant may follow the **higher-priority** rules (the app’s system rules first, then your saved instructions, then the current user message). If you want to change behavior for a chat, update that conversation’s instructions rather than fighting the assistant mid-thread.

