import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { PluginCatalog, PluginConnectionWithToken } from "@/types";

export default function PluginConnect() {
  const { pluginId = "code_bridge" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading } = useAuth();

  const [label, setLabel] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [siteUrl, setSiteUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [scopes, setScopes] = useState<string[]>(["observe", "connect"]);
  const [result, setResult] = useState<PluginConnectionWithToken | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  const catalog = useQuery({
    queryKey: ["plugin-catalog"],
    queryFn: () => apiGet<PluginCatalog>("/plugins/catalog"),
  });

  const plugin = catalog.data?.plugins.find((p) => p.id === pluginId);
  const allScopes = catalog.data?.scopes ?? [];

  const connect = useMutation({
    mutationFn: () =>
      apiPost<PluginConnectionWithToken>("/plugins/connections", {
        plugin_id: pluginId,
        label,
        repo_url: repoUrl,
        branch,
        site_url: siteUrl,
        notes,
        scopes,
      }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["plugin-connections"] });
      toast.success("Connection created — copy the token now, it is shown once");
    },
    onError: () => toast.error("Could not create the connection"),
  });

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      toast.success(`${what} copied`);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  const field =
    "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#d5cfc4]";

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/plugins"
          data-testid="back-to-plugins-link"
          className="mb-6 inline-flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to plugins
        </Link>

        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Connect {plugin?.name ?? "plugin"}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Point VEXION at the site or repository you are building. You get a token and a ready-made
          brief to paste into that project's AI builder.
        </p>

        {!result ? (
          <section
            className="mt-6 space-y-3 rounded-xl border border-border bg-card p-6"
            data-testid="connect-form"
          >
            <label className="block text-[12px] font-medium">Connection name</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My coding site"
              data-testid="connection-label-input"
              className={field}
            />

            <label className="block text-[12px] font-medium">Repository URL</label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/you/your-repo"
              data-testid="connection-repo-input"
              className={field}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium">Branch</label>
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  data-testid="connection-branch-input"
                  className={`${field} mt-1`}
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium">Live site URL (optional)</label>
                <input
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="https://my-app.dev"
                  data-testid="connection-site-input"
                  className={`${field} mt-1`}
                />
              </div>
            </div>

            <label className="block pt-2 text-[12px] font-medium">Permissions</label>
            <div className="space-y-2" data-testid="scope-list">
              {allScopes.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.id)}
                    onChange={(e) =>
                      setScopes((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                      )
                    }
                    data-testid={`scope-${s.id}-checkbox`}
                    className="mt-0.5 h-4 w-4 accent-[#b8552f]"
                  />
                  <span>
                    <span className="block text-[13px] font-medium">{s.label}</span>
                    <span className="block text-[12px] text-muted-foreground">{s.description}</span>
                  </span>
                </label>
              ))}
            </div>

            <label className="block pt-2 text-[12px] font-medium">Notes for VEXION (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Stack, conventions, what you want VEXION to watch for."
              data-testid="connection-notes-input"
              className={`${field} resize-none`}
            />

            <button
              onClick={() => label.trim() && connect.mutate()}
              disabled={!label.trim() || connect.isPending}
              data-testid="create-connection-button"
              className="mt-2 rounded-lg bg-clay px-5 py-2.5 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29] disabled:opacity-50"
            >
              {connect.isPending ? "Creating…" : "Create connection"}
            </button>
          </section>
        ) : (
          <section className="mt-6 space-y-4" data-testid="connect-result">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-[13px] font-semibold">Connection token</h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Shown once. Store it as <code>VEXION_BRIDGE_TOKEN</code> in the other project's
                environment — never commit it.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code
                  data-testid="connection-token"
                  className="flex-1 overflow-x-auto rounded-lg border border-border bg-muted/60 px-3 py-2 font-mono text-[12px]"
                >
                  {result.token}
                </code>
                <button
                  onClick={() => copy(result.token, "Token")}
                  data-testid="copy-token-button"
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] transition-colors duration-200 hover:bg-secondary"
                >
                  {copied === "Token" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-[13px] font-semibold">Brief for the other AI</h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Paste this into your coding site's AI builder. It explains exactly how to talk to
                VEXION and what it is allowed to do.
              </p>
              <pre
                data-testid="handshake-prompt"
                className="vx-scroll mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/60 p-3 font-mono text-[11.5px]"
              >
                {result.handshake_prompt}
              </pre>
              <button
                onClick={() => copy(result.handshake_prompt, "Brief")}
                data-testid="copy-prompt-button"
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] transition-colors duration-200 hover:bg-secondary"
              >
                {copied === "Brief" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy brief
              </button>
            </div>

            <Link
              to="/plugins"
              data-testid="finish-connect-link"
              className="inline-block rounded-lg bg-clay px-5 py-2.5 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29]"
            >
              Done
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
