# Prompt Knowledge Base

Prompt Knowledge Base is a web app where you can chat with an AI assistant, save conversations to your personal knowledge base, replay them step-by-step for review, and organize content with tags and collections.

## Instructions, custom instructions, and system prompts

You control **how the assistant behaves** using the **Customize** panel on the chat page.

### Where to find it

- In the **chat header**, click **Customize** to open the panel.
- You’ll see:
  - **Model** — choose provider (OpenAI / Gemini) and model; saved as e.g. `openai:gpt-4o-mini`.
  - **Templates** — pick a template (e.g. *General dev assistant*, *Code review (PR-style)*, *Learning coach*), then **Apply** to fill **System prompt** and **Custom instructions**; use the starter prompt chips to start a new chat with that template.
  - **System prompt (sample included)** — textarea for the assistant’s role and fixed rules.
  - **Custom instructions (sample included)** — textarea for your preferences (tone, format, defaults).

Settings are stored in your browser and apply to every message you send. (Per-conversation overrides may be added later.)

### What’s the difference?

- **Custom instructions (the field you edit)**  
  Your **preferences**: tone, structure, level of detail, default assumptions. The app sends these with each request.

- **System prompt (the other field)**  
  A **high-priority control message** that sets the assistant’s role and “always true” rules.  
  In this app, **System prompt** and **Custom instructions** are combined and sent as a **single system message** on every turn (as noted under the textareas).

So: **custom instructions** = what you want the assistant to do by default; **system prompt** = who the assistant is and its invariants.

### When to use each field

- **System prompt**: use for role and guardrails that should rarely change:
  - “You are a knowledgeable assistant helping a developer…”
  - “Be practical and precise. Use markdown…”
  - “When unsure, ask 1–2 clarifying questions.”

- **Custom instructions**: use for your working preferences (you can change these per template or over time):
  - Preferred tone (concise, direct, friendly)
  - Output format (bullets, checklists, “include a test plan”)
  - Your context (tech stack, skill level)
  - Or switch **Templates** and **Apply** to load a preset (e.g. code review vs learning coach)

### How to write good instructions

- **Be specific about output**: format, length, and what to include/exclude.
- **State constraints**: languages/frameworks, time, environment, APIs, security constraints.
- **Set a role if helpful**: reviewer, tutor, pair programmer, product manager.
- **Avoid contradictions**: conflicting instructions cause unpredictable results.
- **Keep it short**: a few clear bullets usually work better than paragraphs.

### Examples you can paste

You can type these into **Custom instructions**, or use **Templates** → *Code review (PR-style)* / *Learning coach* and **Apply** to load similar presets.

**Concise engineering assistant:**

- Keep answers under 10 bullets.
- Prefer TypeScript + React examples.
- When giving changes, include a short test plan.

**Code review mode** (or use template *Code review (PR-style)*):

- Review my changes for correctness, security, and maintainability.
- Call out risks and propose minimal diffs.
- If you’re unsure, ask a single focused question.

**Learning mode** (or use template *Learning coach*):

- Explain step-by-step with small examples.
- Pause after each step with a quick check question.

### Important note about priority

The app sends your **System prompt** and **Custom instructions** as one system message on every turn. If something you say in the chat conflicts with those instructions, the model will usually favor the system message. To change behavior, edit **Customize** (or switch **Templates** and **Apply**) and send again.

