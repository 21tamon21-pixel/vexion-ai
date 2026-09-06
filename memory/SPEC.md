# VEXION — living spec

**What it is:** a personal AI assistant with a futuristic HUD console. Core loop:
type or speak → Claude streams a reply over SSE → markdown/code/maths/mermaid
render → optional spoken playback.

## Data model (MongoDB, string uuid4 `id`s)
- `users` — id, email, name, password_hash (pbkdf2), persona{system_prompt, tone, verbosity, voice_enabled, auto_speak, voice_name}
- `sessions` — token, user_id, expires_at (httpOnly cookie `vexion_session`)
- `conversations` — id, user_id, title, pinned, created_at, updated_at
- `messages` — id, conversation_id, role(user|assistant), content, status(complete|streaming|stopped|error), created_at

## Routes (all under /api)
- `GET /config` — real runtime state (provider, model, provider_ready, mocked, feature flags)
- `POST /auth/signup|login|logout`, `GET /auth/me`, `PATCH /auth/persona`
- `GET|POST /conversations`, `GET /conversations/search?q=`, `GET|PATCH|DELETE /conversations/{id}`
- `POST /chat/{conversation_id}/stream` — SSE: start / delta / error / done

## Key flows
1. Boot sequence (~2s, skippable, disabled under reduced-motion) → login/signup.
2. Empty state: centered input + suggestion chips; after the first send the input
   sits at the bottom and messages scroll above it.
3. Send → optimistic user bubble → SSE deltas → rendered assistant message.
4. Stop aborts the stream; the backend persists partial text as `stopped`.
5. Regenerate / edit-and-resend truncate the conversation at the anchor message.
6. Sidebar: new session, rename (double-click title), pin, delete, search.
7. Settings: persona (system prompt, tone, verbosity), voice selection/auto-speak,
   real system state readout.

## Auth
Email + password only. httpOnly cookie session. Every conversation/message query
is filtered by `user_id` — per-user isolation is server-enforced.

## Not built (documented extension points, no fake UI)
Attachments/vision, PDF & URL extraction, link-preview cards, OAuth, email
verification, password reset, export/share, usage dashboard, command palette,
long-term memory, web search, image generation, tools.

Full handoff detail: `/app/PROJECT_CONTEXT.md`.
