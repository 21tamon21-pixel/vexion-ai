# VEXION — Personal Intelligence Core

A personal, provider-agnostic AI assistant with a futuristic HUD console.
Type or speak → the model streams a reply → markdown, code, mathematics and
diagrams render → VEXION can read the answer aloud.

The product name is configurable: set `APP_NAME` in `backend/.env`.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui | fast, typed, no framework lock-in, plain static build |
| Data fetching | TanStack Query | cache + invalidation, no fetch-in-effect |
| Rendering | react-markdown, remark-gfm, remark-math, rehype-katex, rehype-highlight, mermaid | one composable pipeline, each plugin swappable |
| Backend | FastAPI (async) + Pydantic v2 | typed request/response contracts, native SSE |
| Database | MongoDB via motor | document shape matches conversations/messages |
| Auth | in-app email + password, httpOnly cookie sessions | zero external dependency, exports cleanly (see PROJECT_CONTEXT §8) |
| Streaming | Server-Sent Events | simplest reliable one-way token stream |

## Run locally

```bash
# backend
cd backend
pip install -r requirements.txt
cp ../.env.example .env      # then fill in EMERGENT_LLM_KEY (or leave blank for mock mode)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# frontend (second terminal)
cd frontend
yarn install
yarn dev                     # http://localhost:3000, proxies /api -> :8001
```

MongoDB must be reachable at `MONGO_URL`.

## Build & deploy

```bash
cd frontend && yarn build    # static bundle in frontend/dist
cd backend  && uvicorn server:app --host 0.0.0.0 --port 8001
```

Serve `frontend/dist` from any static host and reverse-proxy `/api` to the
uvicorn process so both live behind one origin (that is the only deployment
requirement — cookies and relative `/api` paths depend on it).

## Environment variables

Every variable is documented in [`.env.example`](./.env.example).
Copy it to `backend/.env`. No secret is ever sent to the browser; the only
config the frontend sees is the non-secret payload of `GET /api/config`.

## Quality gates

```bash
cd frontend && yarn typecheck   # tsc -b, strict
cd frontend && yarn lint        # oxlint
cd backend  && pytest           # backend specs
```

## Export to GitHub

The repository is ordinary source: `backend/` (Python + requirements.txt),
`frontend/` (package.json + Vite), docs and `.env.example`. There is no
builder-specific runtime dependency — `git init && git push` and it runs in
Codespaces or on any machine with Python 3.11+, Node 20+ and MongoDB.

## Further reading

**[PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)** — architecture, how to swap an AI
provider, streaming protocol, rendering pipeline, voice, application state
machine, and an explicit list of what is real, what is mocked, and what is not
built yet. Read it before continuing development.
