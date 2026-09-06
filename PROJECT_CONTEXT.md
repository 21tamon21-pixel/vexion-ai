# VEXION — Project Context

> Handoff document. Read this before changing anything. Companion to `README.md`.

## 1. What VEXION is

A personal, provider-agnostic AI assistant with a calm, paper-toned interface
(neutral warm-white surfaces, one clay accent, no animated background or motion
decoration). The core loop is: **user types or speaks → the selected model
reasons → the response streams token-by-token → markdown / code / maths /
diagrams / generated images render → VEXION can speak it.**

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

## 3. Swapping or adding an AI model

Two layers:

1. **Provider** (`backend/lib/providers.py`) — *how* we talk to an API. Implement
   `async def stream(self, system, history, vendor, model)` and register it in
   `_REGISTRY`; select with `LLM_PROVIDER` in `.env`.
2. **Catalog** (`backend/lib/models_catalog.py`) — *what the user picks*. Five
   tiers, each mapping a friendly name (Lumen → Aether) to a vendor + model id,
   plus `requires_auth` and `plan_required` for future subscriptions. Adding,
   removing or repricing a model is an edit to this list only: the picker, the
   command palette, the settings page and the server-side tier check all read it.

Tier 1 (`FREE_MODEL_ID`) is the guest model. The frontend never sees a vendor or
a model id — only the catalog's public fields.

## 3b. Access tiers and guest mode

- No account: `POST /api/chat/guest/stream`. The **client** owns the history and
  sends it in the body; the server writes nothing. Only tier 1 is permitted.
- Signed in: `POST /api/chat/{conversation_id}/stream` with `model_id`. The
  server re-validates the tier and returns 403 for a locked model, so hiding a
  model in the UI is a convenience, not the security boundary.
- Billing is **not** implemented. `plan_required` is metadata only; every tier
  unlocks with any account today. That is the documented seam for subscriptions.

## 3c. Image generation

`POST /api/images/generate` calls the Gemini image model through the universal
key and returns a **data URL**, which flows into the same `MessageRenderer`
image path as any other picture (click to zoom). Triggered by `/image <prompt>`,
the command palette or a suggestion chip. Object storage is not configured, so
images are stored inline in the message document — fine for personal use, and
the place to swap in S3/Supabase later (`FEATURE_IMAGE_GENERATION` gates it).

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
transcribing | speaking | interrupted | error`. The header status text derives
from this value — the states are real, never decorative.

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

**Real:** guest chat (tier 1, nothing persisted), auth + sessions, per-user data
isolation, conversations CRUD/pin/rename/search, the five-tier model catalog with
a picker in the composer, SSE streaming on every tier, stop/regenerate/
edit-and-resend, image generation, persona configuration, the full rendering
pipeline, browser voice input and output, command palette (Cmd/Ctrl+K), Markdown
export, toasts.

**Mocked (labelled in the UI):** when `EMERGENT_LLM_KEY` is unset or
`LLM_PROVIDER=echo`, the brain is `EchoProvider` and the header shows a
`mock brain` badge.

Also real: projects (shared instructions per chat group), image + PDF + text
attachments with server-side extraction and multimodal image input, the usage
dashboard, plan-based tier gating (402 above your plan), and the Code Bridge
plugin (token-authenticated `/api/bridge/*` for an external coding site, with
observe/connect/edit/run scopes and revocation).

**Configured by the operator, honest until then:** PayPal. `PAYPAL_CLIENT_ID`
and `PAYPAL_SECRET` are empty, so `/api/billing/paypal/*` returns 503 and the
Plans page states PayPal is not configured. No charge is ever simulated.

**Not built (extension points documented, no fake UI):**
recurring PayPal subscriptions (one-off orders only), URL/page extraction,
OpenGraph link-preview cards, OAuth (Google/GitHub), email verification and
password reset, cloud object storage (images and attachments are inlined),
share links, vector/long-term memory, web search, autonomous tool execution.

**Fixed bug worth knowing:** the session cookie was always `Secure`, so over
plain http the browser dropped it while the SPA still believed it was signed in
— every write then 401'd as "Could not start a chat". `create_session` now sets
`secure` from `X-Forwarded-Proto`/the request scheme, and login re-reads
`/auth/me` before navigating.

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
