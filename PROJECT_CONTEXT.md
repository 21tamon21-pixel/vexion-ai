# VEXION — Project Context

> Handoff document. Read this before changing anything. Companion to `README.md`.

## 1. What VEXION is

A personal, provider-agnostic AI assistant with a futuristic HUD console UI.
The core loop is: **user types or speaks → VEXION reasons → the response streams
token-by-token → markdown / code / maths / diagrams render → VEXION can speak it.**

The application name is configurable (`APP_NAME` in `backend/.env`, surfaced via
`GET /api/config` and used everywhere in the UI). Renaming the product requires
no code change.

## 2. Architecture

```
UI (React pages/components)
  → Application logic (hooks, TanStack Query, lib/stream.ts)
    → HTTP boundary (/api, typed fetch in frontend/src/lib/api.ts)
      → Brain (backend/routers/chat.py — history, persona, SSE)
        → Provider (backend/lib/providers.py — swappable)
```

The frontend has **zero** knowledge of which AI provider is in use. It reads the
real state from `GET /api/config` (`provider`, `model`, `provider_ready`,
`mocked`, `features`) and renders that truthfully.

### Folder map

| Path | Responsibility |
|---|---|
| `backend/lib/config.py` | **Single source of truth** for provider selection, model, persona default, feature flags |
| `backend/lib/providers.py` | Provider abstraction (`ChatProvider.stream`) + registry. `EchoProvider` = mock, `EmergentProvider` = real LLM |
| `backend/lib/security.py` | pbkdf2 password hashing, httpOnly cookie sessions, `current_user` dependency |
| `backend/models/schemas.py` | Pydantic v2 models (mirrored by `frontend/src/types.ts`) |
| `backend/routers/auth.py` | signup / login / logout / me / persona |
| `backend/routers/conversations.py` | list, create, get, rename, pin, delete, cross-conversation search |
| `backend/routers/chat.py` | The brain endpoint — SSE streaming, conversation memory, edit/regenerate truncation |
| `frontend/src/lib/stream.ts` | SSE client (the only place raw `fetch` is used) |
| `frontend/src/hooks/useVoice.ts` | Voice abstraction (STT + TTS) |
| `frontend/src/components/render/` | `MessageRenderer`, `CodeBlock`, `Mermaid` — the rendering pipeline |
| `frontend/src/pages/` | `Chat`, `Login`, `Settings` |

## 3. Swapping an AI provider

1. Add a class in `backend/lib/providers.py` implementing
   `async def stream(self, system, history) -> AsyncIterator[str]`.
2. Register it in `_REGISTRY`.
3. Set `LLM_PROVIDER=<key>` (plus any keys) in `backend/.env` and restart.

Nothing in the frontend, database, rendering, voice or auth layers changes.
Multiple providers can coexist in the registry; routing between them is a future
extension inside `get_provider()`.

## 4. Streaming

`POST /api/chat/{conversation_id}/stream` returns `text/event-stream` with four
event types:

| event | payload |
|---|---|
| `start` | `{user_message, message_id, provider, model}` |
| `delta` | `{message_id, text}` |
| `error` | `{message_id, detail}` |
| `done`  | `{message_id, status}` |

The assistant `message_id` is issued **before** the first token so the client can
reconcile deltas safely and never duplicate text after a reconnect. The backend
persists the assistant message in a `finally` block, so a client abort (Stop)
preserves the partial content with `status="stopped"`. Refreshing re-reads the
persisted conversation — no duplicated or lost text.

There is no artificial output cap: generation runs until the provider emits
`StreamDone` or the client aborts.

## 5. Rendering

`MessageRenderer` pipes raw markdown through
`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` +
`rehype-highlight`, with component overrides for code fences (`CodeBlock`:
language label, copy button, line numbers), ```mermaid fences (`Mermaid`),
tables, images (click-to-zoom lightbox) and links. `<think>…</think>` content is
split into a collapsed "show reasoning" block.

Adding a content type = adding one entry to the `components` map. The chat
interface does not change.

## 6. Voice

`useVoice` is the only voice-aware module. Today it wraps the **browser-native**
Web Speech API (STT) and `speechSynthesis` (TTS) — no cloud voice provider is
configured, and the UI says so when a browser lacks support. Replacing either
side means replacing the implementation inside that hook.

## 7. Application state

`AppState` in `frontend/src/types.ts` is the authoritative machine:
`idle | composing | sending | streaming | stopped | complete | listening |
transcribing | speaking | interrupted | error`. The HUD status indicator derives
its label and colour from this value — the states are real, never decorative.

## 8. Authentication

Email + password, hashed with pbkdf2-sha256, sessions stored in MongoDB and
carried by an httpOnly `vexion_session` cookie. No token ever reaches JavaScript.
Every conversation and message query is filtered by `user_id`, so data isolation
is enforced server-side.

Swapping to a managed provider (Clerk / Supabase / Auth.js) means replacing
`backend/lib/security.py` + `routers/auth.py` and keeping `GET /api/auth/me`.
It was **not** used here to avoid an external dependency in an exportable
repository — the whole app runs from `docker`-free plain source.

## 9. Environment variables

See `.env.example`. Every variable is documented there.

## 10. What is real, mocked, or not built

**Real:** auth + sessions, per-user data isolation, conversations CRUD/pin/
rename/search, SSE streaming from Claude via the Emergent key, stop/regenerate/
edit-and-resend, persona configuration, the full rendering pipeline, browser
voice input and output, boot sequence, HUD visuals, toasts.

**Mocked (labelled in the UI):** when `EMERGENT_LLM_KEY` is unset or
`LLM_PROVIDER=echo`, the brain is `EchoProvider` and the header reads
`MOCK BRAIN`.

**Not built (extension points documented, no fake UI):**
file/image attachments and multimodal input, server-side PDF/URL extraction,
OpenGraph link-preview cards, OAuth (Google/GitHub), email verification and
password reset, cloud object storage, conversation export/share links, usage
dashboard, command palette, vector/long-term memory, web search, image
generation, tool execution.

Feature flags for the unfinished capabilities exist in `lib/config.py` and are
shipped **disabled**; the UI hides them rather than faking them.

## 11. Known issues

- Conversation search is a substring scan, not a text index — fine at personal
  scale, replace with a Mongo text index if history grows large.
- Edit-and-resend uses a browser `prompt()` for the edit box.
- Long histories are truncated to the last 40 messages (`MAX_HISTORY`);
  summarisation/vector memory is the documented next step.

## 12. Roadmap

Stage 2 voice streaming and barge-in → Stage 3 model routing + memory →
Stage 4 attachments/vision/documents → Stage 5 tools and automation.
