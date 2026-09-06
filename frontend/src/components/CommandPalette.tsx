import { useEffect, useMemo, useState } from "react";
import { Command } from "lucide-react";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Cmd/Ctrl+K command palette. Actions are supplied by the host page. */
export default function CommandPalette({ actions }: { actions: PaletteAction[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  }, [actions, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[14vh]"
      onClick={() => setOpen(false)}
      data-testid="command-palette"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-3">
          <Command className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands"
            data-testid="command-palette-input"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.map((a) => (
            <button
              key={a.id}
              data-testid={`command-${a.id}`}
              onClick={() => {
                setOpen(false);
                a.run();
              }}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors duration-200 hover:bg-secondary"
            >
              <span>{a.label}</span>
              {a.hint && <span className="text-[11px] text-muted-foreground">{a.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">No commands</p>
          )}
        </div>
      </div>
    </div>
  );
}
