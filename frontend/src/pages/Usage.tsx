import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet } from "@/lib/api";
import { useAppConfig, useAuth } from "@/hooks/useAuth";
import type { UsageSummary } from "@/types";

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function Meter({
  label,
  used,
  total,
  format = (v: number) => String(v),
  testid,
}: {
  label: string;
  used: number;
  total: number;
  format?: (v: number) => string;
  testid: string;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div data-testid={testid}>
      <div className="flex justify-between text-[12.5px]">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {format(used)} / {format(total)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${pct > 90 ? "bg-destructive" : "bg-[#b8552f]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl" data-testid={testid}>
        {value}
      </p>
    </div>
  );
}

export default function Usage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  const { data: config } = useAppConfig();
  const usage = useQuery({
    queryKey: ["usage"],
    queryFn: () => apiGet<UsageSummary>("/usage/summary"),
    enabled: Boolean(user),
  });

  const data = usage.data;
  const maxDay = Math.max(1, ...(data?.by_day ?? []).map((d) => d.messages));

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

        <h1 className="font-heading text-2xl font-semibold tracking-tight">Usage</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Counted from your stored messages. Token figures are approximations (≈4 characters per
          token), not provider-billed counts.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Messages" value={String(data?.total_messages ?? 0)} testid="usage-messages" />
          <Stat label="Chats" value={String(data?.total_conversations ?? 0)} testid="usage-chats" />
          <Stat label="Projects" value={String(data?.total_projects ?? 0)} testid="usage-projects" />
          <Stat label="Images" value={String(data?.images_generated ?? 0)} testid="usage-images" />
        </div>

        {data?.quotas && (
          <>
            <section
              className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6"
              data-testid="usage-quotas"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">AI limits</h2>
                <span className="text-[11.5px] text-muted-foreground">
                  plan: {data.quotas.plan}
                  {data.quotas.owner ? " (owner)" : ""} · resets{" "}
                  {new Date(data.quotas.resets_at).toLocaleTimeString()}
                </span>
              </div>
              <Meter
                label="Messages today"
                used={data.quotas.ai.daily_used}
                total={data.quotas.ai.daily_limit}
                testid="quota-ai-daily"
              />
              <Meter
                label="Messages this month"
                used={data.quotas.ai.monthly_used}
                total={data.quotas.ai.monthly_limit}
                testid="quota-ai-monthly"
              />
              <p className="text-[12px] text-muted-foreground">
                Claude, Groq and the other premium models draw from the same allowance; access to
                each one is decided by your plan tier (up to tier{" "}
                {data.quotas.limits.max_tier}).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(config?.models ?? []).map((m) => (
                  <div
                    key={m.id}
                    data-testid={`model-access-${m.id}`}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[12px]"
                  >
                    <span>
                      {m.name}
                      <span className="ml-1 text-muted-foreground">· {m.provider_label}</span>
                    </span>
                    <span
                      className={
                        !m.available
                          ? "text-muted-foreground"
                          : m.tier <= data.quotas.limits.max_tier
                            ? "text-[#3f6b45]"
                            : "text-[#b8552f]"
                      }
                    >
                      {!m.available
                        ? "no key"
                        : m.tier <= data.quotas.limits.max_tier
                          ? "included"
                          : `${m.plan_required} plan`}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section
              className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6"
              data-testid="usage-tavily"
            >
              <h2 className="text-[13px] font-semibold">Tavily research</h2>
              <Meter
                label="Researches today"
                used={data.quotas.tavily.daily_used}
                total={data.quotas.tavily.daily_limit}
                testid="quota-tavily-daily"
              />
              <Meter
                label="Researches this month"
                used={data.quotas.tavily.monthly_used}
                total={data.quotas.tavily.monthly_limit}
                testid="quota-tavily-monthly"
              />
              <Meter
                label="Project-wide today (credit protection)"
                used={data.quotas.tavily.project_daily_used}
                total={data.quotas.tavily.project_daily_limit}
                testid="quota-tavily-project"
              />
              <p className="text-[12px] text-muted-foreground">
                Limits are enforced on the server, so they cannot be bypassed from the browser.
                Identical recent searches are served from cache and cost no credit.
              </p>
            </section>

            <section
              className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6"
              data-testid="usage-storage"
            >
              <h2 className="text-[13px] font-semibold">Storage</h2>
              <Meter
                label="Used"
                used={data.storage.used_bytes}
                total={data.storage.total_bytes}
                format={bytes}
                testid="storage-meter"
              />
              <dl className="grid grid-cols-2 gap-y-1 text-[12.5px]">
                <dt className="text-muted-foreground">Files / attachments</dt>
                <dd>
                  {data.storage.files} · {bytes(data.storage.attachment_bytes)}
                </dd>
                <dt className="text-muted-foreground">Chat & generated images</dt>
                <dd>{bytes(data.storage.project_bytes)}</dd>
                <dt className="text-muted-foreground">Remaining</dt>
                <dd>{bytes(Math.max(0, data.storage.total_bytes - data.storage.used_bytes))}</dd>
              </dl>
            </section>

            <section
              className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6"
              data-testid="usage-cache"
            >
              <h2 className="text-[13px] font-semibold">Cache</h2>
              <Meter
                label="Research cache used"
                used={data.cache.used_bytes}
                total={data.cache.total_bytes}
                format={bytes}
                testid="cache-meter"
              />
              <dl className="grid grid-cols-2 gap-y-1 text-[12.5px]">
                <dt className="text-muted-foreground">Cached items</dt>
                <dd data-testid="cache-items">{data.cache.items}</dd>
                <dt className="text-muted-foreground">Entries expire after</dt>
                <dd>{Math.round(data.cache.ttl_minutes / 60)} h</dd>
                <dt className="text-muted-foreground">Remaining</dt>
                <dd>{bytes(Math.max(0, data.cache.total_bytes - data.cache.used_bytes))}</dd>
              </dl>
              <button
                onClick={async () => {
                  await apiDelete("/research/cache");
                  await usage.refetch();
                  toast.success("Research cache cleared");
                }}
                data-testid="clear-cache-button"
                className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] transition-colors duration-200 hover:bg-secondary"
              >
                Clear research cache
              </button>
            </section>
          </>
        )}

        <section className="mt-4 rounded-xl border border-border bg-card p-6" data-testid="usage-by-model">
          <h2 className="text-[13px] font-semibold">By model</h2>
          <div className="mt-4 space-y-3">
            {(data?.by_model ?? []).map((m) => {
              const max = Math.max(1, ...(data?.by_model ?? []).map((x) => x.messages));
              return (
                <div key={m.model_id} data-testid={`usage-model-${m.model_id}`}>
                  <div className="flex justify-between text-[12.5px]">
                    <span className="font-medium">{m.model_name}</span>
                    <span className="text-muted-foreground">
                      {m.messages} replies · ~{m.approx_tokens.toLocaleString()} tok
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-[#b8552f]"
                      style={{ width: `${(m.messages / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(data?.by_model ?? []).length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">
                No replies recorded yet — send a message first.
              </p>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-card p-6" data-testid="usage-by-day">
          <h2 className="text-[13px] font-semibold">Last 14 active days</h2>
          <div className="mt-4 flex h-32 items-end gap-1.5">
            {(data?.by_day ?? []).map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[#b8552f]/80"
                  style={{ height: `${(d.messages / maxDay) * 100}%` }}
                  title={`${d.day}: ${d.messages}`}
                />
                <span className="text-[9.5px] text-muted-foreground">{d.day.slice(5)}</span>
              </div>
            ))}
            {(data?.by_day ?? []).length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">Nothing to chart yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
