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

## Projects
`projects` collection. A project holds name/description/instructions; its
instructions are appended to the system prompt of every chat whose
`project_id` matches. `/?project=<id>` scopes the sidebar and new chats to it.
Deleting a project keeps its chats (their `project_id` becomes null).

## Attachments
`POST /api/attachments` (multipart). Images -> base64 data URL, passed to the
model as multimodal `ImageContent`. PDFs -> text via pypdf. txt/md/csv/json ->
raw text. Extracted text is prepended to the turn. Max 8 MB, 6 files per turn.
Stored inside Mongo — no object store is configured.

## Plans & payments (PayPal)
`lib/plans.py`: free (tiers 1-3), core $12 (tier 4), pro $29 (tier 5).
`max_tier_for(plan)` gates the model at request time (402 when too high).
`POST /api/billing/paypal/order` + `/capture` use the PayPal REST API.
PAYPAL_CLIENT_ID/PAYPAL_SECRET are EMPTY -> those endpoints return 503 and the
UI says "PayPal is not configured". Recurring billing is not implemented
(one-off orders only).

## Plugins & Code Bridge
`lib/plugins_catalog.py` lists Code Bridge (available) plus three unavailable
entries. Connecting mints a `vxb_...` bearer token (shown once) plus a
handshake brief to paste into another AI builder. External calls:
`GET /api/bridge/handshake`, `POST /api/bridge/observe`, `POST /api/bridge/ask`
— scope-checked (observe/connect/edit/run), 200 KB cap, revocable. VEXION never
writes files or executes anything.

## Usage
`GET /api/usage/summary` counts real message documents (approx tokens = chars/4).

## Not built (documented extension points, no fake UI)
Recurring PayPal subscriptions, URL/page extraction, OpenGraph link previews,
OAuth, email verification, password reset, share links, object storage,
long-term memory, web search, tool execution.

Full handoff detail: `/app/PROJECT_CONTEXT.md`.
