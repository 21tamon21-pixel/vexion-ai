import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import type { BillingState, Subscription } from "@/types";

interface PayPalOrder {
  id: string;
  links?: { href: string; rel: string }[];
}

export default function Billing() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  const billing = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiGet<BillingState>("/billing/state"),
    enabled: Boolean(user),
  });

  const current = billing.data?.subscription.plan_id ?? "free";

  const subscribe = async (planId: string) => {
    setBusy(planId);
    try {
      const order = await apiPost<PayPalOrder>("/billing/paypal/order", { plan_id: planId });
      const approve = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action");
      if (approve) {
        window.open(approve.href, "_blank", "noopener");
        toast.info("Approve the payment in the PayPal tab, then return here", {
          description: "Your plan updates once PayPal confirms the capture.",
        });
      } else {
        toast.error("PayPal did not return an approval link");
      }
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? ((err.body as { detail?: string })?.detail ?? "Checkout failed")
          : "Checkout failed";
      toast.error(detail);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    try {
      await apiPost<Subscription>("/billing/cancel");
      await qc.invalidateQueries({ queryKey: ["billing"] });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Back on the Free plan");
    } catch {
      toast.error("Could not change the plan");
    }
  };

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

        <h1 className="font-heading text-2xl font-semibold tracking-tight">Plans</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Payments run through PayPal. Higher plans raise the model tier ceiling.
        </p>

        {billing.data && !billing.data.paypal_configured && (
          <p
            className="mt-4 rounded-lg border border-border bg-secondary/60 px-4 py-3 text-[12.5px] text-muted-foreground"
            data-testid="paypal-not-configured"
          >
            <strong className="font-medium">PayPal is not configured yet.</strong> Add
            <code className="mx-1 rounded bg-card px-1.5 py-0.5 font-mono text-[11.5px]">
              PAYPAL_CLIENT_ID
            </code>
            and
            <code className="mx-1 rounded bg-card px-1.5 py-0.5 font-mono text-[11.5px]">
              PAYPAL_SECRET
            </code>
            to <code className="font-mono text-[11.5px]">backend/.env</code> (plus
            <code className="mx-1 font-mono text-[11.5px]">PAYPAL_ENV=live</code> when you go live)
            and restart the backend. Until then checkout returns a clear error instead of pretending
            to charge.
          </p>
        )}

        <div className="mt-6 grid gap-3 md:grid-cols-3" data-testid="plan-list">
          {(billing.data?.plans ?? []).map((p) => {
            const active = p.id === current;
            return (
              <section
                key={p.id}
                data-testid={`plan-${p.id}`}
                className={`flex flex-col rounded-xl border bg-card p-5 ${
                  active ? "border-[#b8552f]" : "border-border"
                }`}
              >
                <h2 className="font-heading text-lg font-semibold">{p.name}</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {p.price_usd === 0 ? "Free" : `$${p.price_usd.toFixed(0)} / ${p.interval}`}
                </p>
                <p className="mt-1 text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  up to tier {p.max_tier}
                </p>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-[12.5px] text-muted-foreground">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#b8552f]" /> {f}
                    </li>
                  ))}
                </ul>
                {active ? (
                  <span
                    className="mt-4 rounded-lg border border-border py-2 text-center text-[12.5px] text-muted-foreground"
                    data-testid={`plan-${p.id}-current`}
                  >
                    Current plan
                  </span>
                ) : p.id === "free" ? (
                  <button
                    onClick={cancel}
                    data-testid="downgrade-button"
                    className="mt-4 rounded-lg border border-border py-2 text-[12.5px] transition-colors duration-200 hover:bg-secondary"
                  >
                    Switch to Free
                  </button>
                ) : (
                  <button
                    onClick={() => void subscribe(p.id)}
                    disabled={busy === p.id}
                    data-testid={`subscribe-${p.id}-button`}
                    className="mt-4 rounded-lg bg-[#b8552f] py-2 text-[12.5px] font-medium text-white transition-colors duration-200 hover:bg-[#a34c29] disabled:opacity-50"
                  >
                    {busy === p.id ? "Opening PayPal…" : `Pay with PayPal`}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        <section className="mt-4 rounded-xl border border-border bg-card p-6" data-testid="billing-state">
          <h2 className="text-[13px] font-semibold">Billing state</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[12.5px]">
            <dt className="text-muted-foreground">Plan</dt>
            <dd data-testid="current-plan">{current}</dd>
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{billing.data?.subscription.provider ?? "none"}</dd>
            <dt className="text-muted-foreground">PayPal environment</dt>
            <dd>{billing.data?.paypal_env ?? "—"}</dd>
            <dt className="text-muted-foreground">PayPal configured</dt>
            <dd className={billing.data?.paypal_configured ? "text-[#3f6b45]" : "text-[#b8552f]"}>
              {billing.data?.paypal_configured ? "yes" : "no"}
            </dd>
          </dl>
          <p className="mt-4 text-[12px] text-muted-foreground">
            Recurring billing is not wired up: checkout creates a one-off PayPal order, so renewals
            are manual for now.
          </p>
        </section>
      </div>
    </div>
  );
}
