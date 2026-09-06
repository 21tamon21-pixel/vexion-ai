import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { UsageSummary } from "@/types";

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
                      className="h-full rounded-full bg-clay"
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
                  className="w-full rounded-t bg-clay/80"
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
