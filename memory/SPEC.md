# VEXION — living spec

**What it is:** a calm, paper-toned AI assistant (Anthropic/Claude-style neutral
UI, no animated background). Type or speak → the chosen model streams a reply →
markdown/code/maths/mermaid render → optional spoken playback or image output.

## Access model
- **Guest (no login):** full chat, free tier-1 model only, **nothing is saved**.
  Guest turns go to `POST /api/chat/guest/stream` with the history in the body.
- **Signed in:** history persisted per user, all five models selectable,
  settings, sidebar. Tiers 2–5 are the hook for future paid plans
  (`plan_required` on each catalog entry) — today they unlock with any account.

## Model catalog (`backend/lib/models_catalog.py`)
| Tier | Name | Vendor / model | Access |
|---|---|---|---|
| 1 | Lumen | gemini · gemini-3-flash-preview | free, guests allowed |
| 2 | Quartz | anthropic · claude-haiku-4-5-20251001 | account |
| 3 | Orion | openai · gpt-5.4 | account |
| 4 | Solace | anthropic · claude-sonnet-4-6 | account |
| 5 | Aether | anthropic · claude-opus-4-6 | account |

Selected from the picker inside the composer bar; the choice is stored in
`localStorage` and sent as `model_id` on each turn. The server re-checks the
tier — a locked model returns 403.

## Data model (MongoDB, string uuid4 `id`s)
- `users` — id, email, name, password_hash (pbkdf2), persona{system_prompt, tone, verbosity, voice_enabled, auto_speak, voice_name}
- `sessions` — token, user_id, expires_at (httpOnly cookie `vexion_session`)
- `conversations` — id, user_id, title, pinned, created_at, updated_at
- `messages` — id, conversation_id, role, content, status, model_id, created_at

## Routes (all under /api)
- `GET /config` — real runtime state + model catalog + feature flags
- `POST /auth/signup|login|logout`, `GET /auth/me`, `PATCH /auth/persona`
- `GET|POST /conversations`, `GET /conversations/search?q=`, `GET|PATCH|DELETE /conversations/{id}`
- `POST /chat/{conversation_id}/stream` — SSE (auth), accepts `model_id`
- `POST /chat/guest/stream` — SSE, free model, no persistence
- `POST /images/generate` — real image generation (Gemini image model), returns a data URL

## Key flows
1. Open the app → chat immediately as a guest.
2. Send → optimistic bubble → SSE deltas → rendered reply. Stop keeps partial text.
3. `/image <prompt>` (or the palette/suggestion chip) generates a picture inline.
4. Cmd/Ctrl+K command palette: new chat, export Markdown, generate image, voice,
   switch model.
5. Export the open chat to a `.md` file.
6. Sidebar (signed in): new/rename/pin/delete/search.
7. Settings: persona, voice, model list, real system state.

## Not built (documented extension points, no fake UI)
Paid subscriptions/billing, attachments & vision input, PDF/URL extraction, link
previews, OAuth, email verification, password reset, share links, usage
dashboard, long-term memory, web search, tools.

Full handoff detail: `/app/PROJECT_CONTEXT.md`.
