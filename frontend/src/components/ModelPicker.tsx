import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import type { ModelInfo } from "@/types";

interface Props {
  models: ModelInfo[];
  selected: string;
  onSelect: (id: string) => void;
  authenticated: boolean;
  onLockedPick: (model: ModelInfo) => void;
}

/** Model selector that lives inside the composer bar. */
export default function ModelPicker({
  models,
  selected,
  onSelect,
  authenticated,
  onLockedPick,
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
        <span className="font-medium">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="listbox"
          data-testid="model-picker-menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-[19rem] overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        >
          <p className="border-b border-border px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            Choose a model
          </p>
          {models.map((m) => {
            const locked = m.requires_auth && !authenticated;
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
                    <Check className="h-4 w-4 text-clay" />
                  ) : locked ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium">{m.name}</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      tier {m.tier}
                    </span>
                    {!m.requires_auth && (
                      <span className="rounded bg-[#e8f0e6] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#3f6b45]">
                        free
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                    {m.tagline}
                  </span>
                </span>
              </button>
            );
          })}
          {!authenticated && (
            <p className="border-t border-border bg-secondary/60 px-3 py-2 text-[11.5px] text-muted-foreground">
              Sign in to unlock tiers 2–5 and save your chat history.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
