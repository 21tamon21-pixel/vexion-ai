import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Lock, Sparkles } from "lucide-react";
import type { ModelInfo } from "@/types";

/** Small provider mark — a lettered chip per provider, no external assets. */
const PROVIDER_MARK: Record<string, { short: string; className: string }> = {
  openai: { short: "AI", className: "bg-[#10a37f]/12 text-[#0d7d61]" },
  claude: { short: "C", className: "bg-[#b8552f]/12 text-[#8a3f22]" },
  gemini: { short: "G", className: "bg-[#4285f4]/12 text-[#2b62b8]" },
  groq: { short: "Q", className: "bg-[#f55036]/12 text-[#b8371f]" },
  qwen: { short: "W", className: "bg-[#6b4dd6]/12 text-[#513aa8]" },
  spark: { short: "•", className: "bg-secondary text-muted-foreground" },
};

export function ProviderIcon({ icon, size = "sm" }: { icon: string; size?: "sm" | "xs" }) {
  const mark = PROVIDER_MARK[icon] ?? PROVIDER_MARK.spark;
  return (
    <span
      data-testid={`provider-icon-${icon}`}
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded font-mono font-semibold ${mark.className} ${
        size === "sm" ? "h-5 w-5 text-[10px]" : "h-4 w-4 text-[9px]"
      }`}
    >
      {mark.short}
    </span>
  );
}

interface Props {
  models: ModelInfo[];
  selected: string;
  onSelect: (id: string) => void;
  authenticated: boolean;
  onLockedPick: (model: ModelInfo) => void;
  maxTier?: number;
}

/** Model selector that lives inside the composer bar. */
export default function ModelPicker({
  models,
  selected,
  onSelect,
  authenticated,
  onLockedPick,
  maxTier = 5,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = models.find((m) => m.id === selected) ?? models[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!active) return null;

  // group by provider so the list reads as providers -> models
  const groups = models.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    (acc[m.provider_label] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="model-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground"
      >
        <ProviderIcon icon={active.icon} size="xs" />
        <span className="font-medium">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="model-picker-menu"
          className="vx-scroll absolute bottom-full left-0 z-30 mb-2 max-h-[26rem] w-[22rem] overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
        >
          {Object.entries(groups).map(([providerLabel, list]) => (
            <div key={providerLabel}>
              <p className="flex items-center gap-2 border-b border-border bg-secondary/50 px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <ProviderIcon icon={list[0].icon} size="xs" /> {providerLabel}
              </p>
              {list.map((m) => {
                const needsAccount = m.requires_auth && !authenticated;
                const needsPlan = authenticated && m.tier > maxTier;
                const locked = needsAccount || needsPlan || !m.available;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === selected}
                    data-testid={`model-option-${m.id}`}
                    onClick={() => {
                      if (locked) {
                        onLockedPick(m);
                        return;
                      }
                      onSelect(m.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors duration-200 ${
                      locked ? "opacity-55 hover:bg-secondary/60" : "hover:bg-secondary"
                    }`}
                  >
                    <span className="mt-0.5 w-4 shrink-0">
                      {m.id === selected ? (
                        <Check className="h-4 w-4 text-[#b8552f]" />
                      ) : locked ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13.5px] font-medium">{m.name}</span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          tier {m.tier}
                        </span>
                        {m.premium && (
                          <span
                            data-testid={`premium-badge-${m.id}`}
                            className="flex items-center gap-0.5 rounded bg-[#f6e7df] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8a3f22]"
                          >
                            <Sparkles className="h-2.5 w-2.5" /> premium
                          </span>
                        )}
                        {!m.requires_auth && (
                          <span className="rounded bg-[#e8f0e6] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#3f6b45]">
                            free
                          </span>
                        )}
                        {m.own_key && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            own key
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                        {!m.available
                          ? m.unavailable_reason
                          : needsPlan
                            ? `Included from the ${m.plan_required} plan`
                            : m.tagline}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!authenticated && (
            <p className="border-t border-border bg-secondary/60 px-3 py-2 text-[11.5px] text-muted-foreground">
              Sign in to unlock the other providers and save your chat history.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
