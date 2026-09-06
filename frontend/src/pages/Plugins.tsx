import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plug, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { PluginCatalog, PluginConnection } from "@/types";

export default function Plugins() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  const catalog = useQuery({
    queryKey: ["plugin-catalog"],
    queryFn: () => apiGet<PluginCatalog>("/plugins/catalog"),
  });

  const connections = useQuery({
    queryKey: ["plugin-connections"],
    queryFn: () => apiGet<PluginConnection[]>("/plugins/connections"),
    enabled: Boolean(user),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiPost(`/plugins/connections/${id}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plugin-connections"] });
      toast.success("Connection revoked — its token no longer works");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/plugins/connections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plugin-connections"] });
      toast.success("Connection deleted");
    },
  });

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          data-testid="back-to-chat-link"
          className="mb-6 inline-flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
        </Link>

        <h1 className="font-heading text-2xl font-semibold tracking-tight">Plugins</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Connect your own tools to VEXION. Each connection gets its own token and only the scopes
          you grant. VEXION advises and suggests patches — it never edits or runs anything itself.
        </p>

        <div className="mt-6 space-y-3" data-testid="plugin-catalog">
          {(catalog.data?.plugins ?? []).map((p) => (
            <section
              key={p.id}
              data-testid={`plugin-${p.id}`}
              className={`rounded-xl border border-border bg-card p-5 ${p.available ? "" : "opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="flex items-center gap-2 text-[15px] font-medium">
                    <Plug className="h-4 w-4 text-[#b8552f]" /> {p.name}
                    {!p.available && (
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                        not available yet
                      </span>
                    )}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">{p.summary}</p>
                </div>
                {p.available ? (
                  <Link
                    to={`/plugins/${p.id}/connect`}
                    data-testid={`connect-${p.id}-button`}
                    className="shrink-0 rounded-lg bg-[#b8552f] px-4 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29]"
                  >
                    Connect
                  </Link>
                ) : (
                  <button
                    disabled
                    className="shrink-0 cursor-not-allowed rounded-lg border border-border px-4 py-2 text-[13px] text-muted-foreground"
                  >
                    Connect
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>

        <h2 className="mt-8 font-heading text-lg font-semibold">Your connections</h2>
        <div className="mt-3 space-y-3" data-testid="connection-list">
          {(connections.data ?? []).map((c) => (
            <section
              key={c.id}
              data-testid="connection-item"
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[14px] font-medium">
                    <Radio
                      className={`h-3.5 w-3.5 ${c.revoked ? "text-muted-foreground" : "text-[#3f6b45]"}`}
                    />
                    {c.label}
                    {c.revoked && (
                      <span className="text-[11px] uppercase tracking-wide text-destructive">
                        revoked
                      </span>
                    )}
                  </p>
                  <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
                    {c.repo_url || "no repository set"} · {c.branch}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    scopes: {c.scopes.join(", ")} · {c.events} events ·{" "}
                    {c.last_seen_at ? `last seen ${new Date(c.last_seen_at).toLocaleString()}` : "never used"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!c.revoked && (
                    <button
                      onClick={() => revoke.mutate(c.id)}
                      data-testid="revoke-connection-button"
                      className="rounded-lg border border-border px-3 py-1.5 text-[12px] transition-colors duration-200 hover:bg-secondary"
                    >
                      Revoke
                    </button>
                  )}
                  <button
                    onClick={() => remove.mutate(c.id)}
                    data-testid="delete-connection-button"
                    aria-label="Delete connection"
                    className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors duration-200 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>
          ))}
          {(connections.data ?? []).length === 0 && (
            <p className="rounded-xl border border-dashed border-border py-10 text-center text-[13px] text-muted-foreground">
              No connections yet. Connect Code Bridge to link a coding site or repository.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
