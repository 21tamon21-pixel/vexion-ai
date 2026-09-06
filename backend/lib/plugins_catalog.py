"""Plugin catalog. A plugin is an outward connection VEXION can hold.

`code_bridge` is fully implemented (see routers/plugins.py + routers/bridge.py):
an external coding site connects with a bearer token and, within the scopes the
operator granted, can read its brief, stream observations in, and ask the model
for help. Everything else is listed as unavailable rather than faked.
"""
from __future__ import annotations

from typing import Any, Dict, List

SCOPES: List[Dict[str, str]] = [
    {"id": "observe", "label": "Observe", "description": "Send files, logs and errors to VEXION"},
    {"id": "connect", "label": "Connect", "description": "Ask VEXION questions from your app"},
    {"id": "edit", "label": "Suggest edits", "description": "Receive patch suggestions for files"},
    {"id": "run", "label": "Propose commands", "description": "Receive shell commands to review"},
]

CATALOG: List[Dict[str, Any]] = [
    {
        "id": "code_bridge",
        "name": "Code Bridge",
        "summary": "Connect a coding website or repository so VEXION can observe it and answer in context.",
        "available": True,
        "scopes": [s["id"] for s in SCOPES],
        "fields": ["label", "repo_url", "branch", "site_url", "notes"],
    },
    {
        "id": "web_research",
        "name": "Web Research",
        "summary": "Let VEXION search the live web before answering.",
        "available": False,
        "scopes": [],
        "fields": [],
    },
    {
        "id": "vector_memory",
        "name": "Long-term Memory",
        "summary": "Persistent semantic memory across every conversation.",
        "available": False,
        "scopes": [],
        "fields": [],
    },
    {
        "id": "calendar",
        "name": "Calendar & Mail",
        "summary": "Read your calendar and draft mail on request.",
        "available": False,
        "scopes": [],
        "fields": [],
    },
]

_BY_ID = {p["id"]: p for p in CATALOG}


def get_plugin(plugin_id: str) -> Dict[str, Any] | None:
    return _BY_ID.get(plugin_id)


def handshake_prompt(base_url: str, label: str, repo_url: str, scopes: List[str]) -> str:
    """The instruction block the operator pastes into their other AI builder."""
    scope_lines = "\n".join(f"  - {s}" for s in scopes)
    return f"""You are connected to VEXION, an external AI brain, over its Code Bridge plugin.

Connection: {label}
Repository: {repo_url or "(not specified)"}
Granted scopes:
{scope_lines}

Base URL: {base_url}/api/bridge
Auth: send the header `Authorization: Bearer <VEXION_BRIDGE_TOKEN>` on every call.
Store the token in an environment variable — never commit it.

Available calls:
  GET  /handshake             -> your brief: label, repo, scopes, project instructions
  POST /observe               -> {{"kind": "file|log|error|note", "path": "...", "summary": "...", "content": "..."}}
  POST /ask                   -> {{"question": "...", "files": [{{"path": "...", "content": "..."}}]}} -> {{"answer": "..."}}

Rules:
  - Call /handshake first and follow the brief you receive.
  - Only use the scopes listed above. If a scope is missing the call returns 403 — do not retry.
  - /ask returns advice and patch suggestions as text. Apply changes yourself; VEXION never writes to your repository directly.
  - Keep each payload under 200 KB.
"""
