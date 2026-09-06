import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Check,
  CreditCard,
  FolderOpen,
  LogOut,
  Pin,
  Plug,
  Plus,
  Search,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { useEndSession } from "@/hooks/useAuth";
import type { AppConfig, Conversation, Project, SearchHit, User } from "@/types";

interface Props {
  conversations: Conversation[];
  projects: Project[];
  activeId: string | null;
  activeProjectId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  user: User;
  appName: string;
  config?: AppConfig;
}

export default function Sidebar({
  conversations,
  projects,
  activeId,
  activeProjectId,
  onSelect,
  onNewChat,
  user,
  appName,
  config,
}: Props) {
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

  const patchConvo = useMutation({
    mutationFn: (v: { id: string; title?: string; pinned?: boolean }) =>
      apiPatch<Conversation>(`/conversations/${v.id}`, { title: v.title, pinned: v.pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const removeConvo = useMutation({
    mutationFn: (id: string) => apiDelete(`/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Chat deleted");
    },
  });

  const results = query.trim().length > 1 ? (search.data ?? []) : null;
  const visible = activeProjectId
    ? conversations.filter((c) => c.project_id === activeProjectId)
    : conversations;

  const planName =
    config?.plans.find((p) => p.id === (user.subscription?.plan_id ?? "free"))?.name ?? "Free";

  const navLink =
    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground transition-colors duration-200 hover:bg-sidebar-accent";

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-sidebar"
      data-testid="sidebar"
    >
      <div className="flex items-center justify-between px-4 py-4">
        <Link
          to="/"
          className="font-heading text-[17px] font-semibold tracking-tight"
          data-testid="sidebar-brand"
        >
          {appName}
        </Link>
        <button
          onClick={onNewChat}
          data-testid="sidebar-new-chat-button"
          aria-label="New chat"
          className="rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
        <Link to="/projects" className={navLink} data-testid="nav-projects">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" /> Projects
          <span className="ml-auto text-[11px] text-muted-foreground">{projects.length}</span>
        </Link>
        <Link to="/plugins" className={navLink} data-testid="nav-plugins">
          <Plug className="h-3.5 w-3.5 text-muted-foreground" /> Plugins
        </Link>
        <Link to="/usage" className={navLink} data-testid="nav-usage">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" /> Usage
        </Link>
        <Link to="/billing" className={navLink} data-testid="nav-billing">
          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" /> Plan
          <span className="ml-auto text-[11px] text-[#b8552f]">{planName}</span>
        </Link>
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            data-testid="conversation-search-input"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <nav
        className="vx-scroll flex-1 space-y-0.5 overflow-y-auto px-2 pb-3"
        data-testid="conversation-list"
      >
        {results
          ? results.map((hit) => (
              <button
                key={hit.conversation_id}
                onClick={() => onSelect(hit.conversation_id)}
                data-testid="search-result-item"
                className="block w-full rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent"
              >
                <div className="truncate text-[13px]">{hit.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">{hit.snippet}</div>
              </button>
            ))
          : visible.map((c) => (
              <div
                key={c.id}
                data-testid="conversation-item"
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors duration-200 ${
                  c.id === activeId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                }`}
              >
                {editing === c.id ? (
                  <>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      data-testid="rename-input"
                      className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
                    />
                    <button
                      data-testid="rename-confirm-button"
                      aria-label="Save title"
                      onClick={() => {
                        patchConvo.mutate({ id: c.id, title: draft.trim() || c.title });
                        setEditing(null);
                      }}
                    >
                      <Check className="h-3.5 w-3.5 text-[#3f6b45]" />
                    </button>
                    <button aria-label="Cancel rename" onClick={() => setEditing(null)}>
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
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
                      className="min-w-0 flex-1 truncate py-0.5 text-left text-[13px]"
                    >
                      {c.pinned && <span className="mr-1 text-[#b8552f]">•</span>}
                      {c.title}
                    </button>
                    <button
                      data-testid="pin-conversation-button"
                      aria-label={c.pinned ? "Unpin chat" : "Pin chat"}
                      onClick={() => patchConvo.mutate({ id: c.id, pinned: !c.pinned })}
                      className={`transition-opacity duration-200 ${
                        c.pinned
                          ? "text-[#b8552f] opacity-100"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button
                      data-testid="delete-conversation-button"
                      aria-label="Delete chat"
                      onClick={() => removeConvo.mutate(c.id)}
                      className="text-muted-foreground opacity-0 transition-opacity duration-200 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
        {!results && visible.length === 0 && (
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No chats yet</p>
        )}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <div className="mb-2 truncate text-[11.5px] text-muted-foreground">
          {user.name} · {user.email}
        </div>
        <div className="flex gap-2">
          <Link
            to="/settings"
            data-testid="settings-link"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[12px] text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
          <button
            data-testid="logout-button"
            aria-label="Sign out"
            onClick={async () => {
              await endSession();
              navigate("/login");
            }}
            className="flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
