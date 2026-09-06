import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Check, LogOut, Pin, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useEndSession } from "@/hooks/useAuth";
import type { Conversation, SearchHit, User } from "@/types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  user: User;
  appName: string;
}

export default function Sidebar({ conversations, activeId, onSelect, user, appName }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const endSession = useEndSession();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const search = useQuery({
    queryKey: ["search", query],
    queryFn: () => apiGet<SearchHit[]>(`/conversations/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 1,
  });

  const createConvo = useMutation({
    mutationFn: () => apiPost<Conversation>("/conversations"),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onSelect(c.id);
    },
  });

  const patchConvo = useMutation({
    mutationFn: (v: { id: string; title?: string; pinned?: boolean }) =>
      apiPatch<Conversation>(`/conversations/${v.id}`, { title: v.title, pinned: v.pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const removeConvo = useMutation({
    mutationFn: (id: string) => apiDelete(`/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Session purged");
    },
  });

  const results = query.trim().length > 1 ? (search.data ?? []) : null;

  return (
    <aside
      className="flex h-full w-72 shrink-0 flex-col border-r border-[#1d2c44] bg-[#0b111c]/80 backdrop-blur-md"
      data-testid="sidebar"
    >
      <div className="flex items-center justify-between px-4 py-4">
        <Link
          to="/"
          className="vx-glow-text font-heading text-lg tracking-[0.32em] text-[#3ec6ff]"
          data-testid="sidebar-brand"
        >
          {appName}
        </Link>
        <button
          onClick={() => createConvo.mutate()}
          data-testid="new-conversation-button"
          aria-label="New session"
          className="rounded-md border border-[#1d2c44] p-1.5 text-[#7f96b3] transition-colors duration-200 hover:border-[#3ec6ff] hover:text-[#3ec6ff]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-md border border-[#1d2c44] bg-[#0d1420] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-[#5c728c]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions"
            data-testid="conversation-search-input"
            className="w-full bg-transparent text-xs outline-none placeholder:text-[#4a5f79]"
          />
        </div>
      </div>

      <nav className="vx-scroll flex-1 space-y-0.5 overflow-y-auto px-2 pb-3" data-testid="conversation-list">
        {results
          ? results.map((hit) => (
              <button
                key={hit.conversation_id}
                onClick={() => onSelect(hit.conversation_id)}
                data-testid="search-result-item"
                className="block w-full rounded-md px-3 py-2 text-left transition-colors duration-200 hover:bg-[#16243a]"
              >
                <div className="truncate text-xs text-[#cfe4f5]">{hit.title}</div>
                <div className="truncate text-[10px] text-[#5c728c]">{hit.snippet}</div>
              </button>
            ))
          : conversations.map((c) => (
              <div
                key={c.id}
                data-testid="conversation-item"
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors duration-200 ${
                  c.id === activeId ? "bg-[#16243a] text-[#9fe4ff]" : "hover:bg-[#111b2b]"
                }`}
              >
                {editing === c.id ? (
                  <>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      data-testid="rename-input"
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                    />
                    <button
                      data-testid="rename-confirm-button"
                      aria-label="Save title"
                      onClick={() => {
                        patchConvo.mutate({ id: c.id, title: draft.trim() || c.title });
                        setEditing(null);
                      }}
                    >
                      <Check className="h-3.5 w-3.5 text-[#43e6b5]" />
                    </button>
                    <button aria-label="Cancel rename" onClick={() => setEditing(null)}>
                      <X className="h-3.5 w-3.5 text-[#7f96b3]" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onSelect(c.id)}
                      data-testid="conversation-open-button"
                      onDoubleClick={() => {
                        setEditing(c.id);
                        setDraft(c.title);
                      }}
                      className="min-w-0 flex-1 truncate py-0.5 text-left text-xs"
                    >
                      {c.pinned && <span className="mr-1 text-[#ffb03e]">▸</span>}
                      {c.title}
                    </button>
                    <button
                      data-testid="pin-conversation-button"
                      aria-label={c.pinned ? "Unpin session" : "Pin session"}
                      onClick={() => patchConvo.mutate({ id: c.id, pinned: !c.pinned })}
                      className={`opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                        c.pinned ? "text-[#ffb03e] opacity-100" : "text-[#5c728c]"
                      }`}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button
                      data-testid="delete-conversation-button"
                      aria-label="Delete session"
                      onClick={() => removeConvo.mutate(c.id)}
                      className="text-[#5c728c] opacity-0 transition-opacity duration-200 hover:text-[#ff5a6a] group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
        {!results && conversations.length === 0 && (
          <p className="px-3 py-6 text-center text-[11px] text-[#4a5f79]">No sessions logged</p>
        )}
      </nav>

      <div className="border-t border-[#1d2c44] px-3 py-3">
        <div className="mb-2 truncate font-mono text-[10px] uppercase tracking-wider text-[#5c728c]">
          {user.name} · {user.email}
        </div>
        <div className="flex gap-2">
          <Link
            to="/settings"
            data-testid="settings-link"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-[#1d2c44] py-1.5 text-[11px] text-[#7f96b3] transition-colors duration-200 hover:border-[#3ec6ff] hover:text-[#3ec6ff]"
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
          <button
            data-testid="logout-button"
            onClick={async () => {
              await endSession();
              navigate("/login");
            }}
            className="flex items-center justify-center gap-1.5 rounded-md border border-[#1d2c44] px-3 py-1.5 text-[11px] text-[#7f96b3] transition-colors duration-200 hover:border-[#ff5a6a] hover:text-[#ff8b96]"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
