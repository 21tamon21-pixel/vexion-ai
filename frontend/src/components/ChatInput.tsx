import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Mic, MicOff, Square } from "lucide-react";
import ModelPicker from "@/components/ModelPicker";
import type { ModelInfo } from "@/types";

/** Extension point: add an entry, get a command. Nothing else changes. */
export const SLASH_COMMANDS = [
  { cmd: "/image", hint: "Generate an image from a description" },
  { cmd: "/summarize", hint: "Summarize the conversation so far" },
  { cmd: "/code", hint: "Answer with code only" },
  { cmd: "/math", hint: "Answer with full LaTeX working" },
  { cmd: "/diagram", hint: "Answer with a diagram" },
  { cmd: "/clear", hint: "Start a new chat" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  listening: boolean;
  micAvailable: boolean;
  onMicToggle: () => void;
  models: ModelInfo[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  authenticated: boolean;
  onLockedPick: (m: ModelInfo) => void;
  autoFocus?: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  listening,
  micAvailable,
  onMicToggle,
  models,
  selectedModel,
  onSelectModel,
  authenticated,
  onLockedPick,
  autoFocus,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const suggestions = useMemo(() => {
    if (!value.startsWith("/") || value.includes(" ")) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(value.toLowerCase()));
  }, [value]);

  // The ONE authoritative submission handler.
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!streaming) onSubmit();
    }
  };

  return (
    <div className="relative w-full">
      {suggestions.length > 0 && (
        <div
          className="absolute bottom-full z-30 mb-2 w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
          data-testid="slash-menu"
        >
          {suggestions.map((s) => (
            <button
              key={s.cmd}
              data-testid={`slash-option-${s.cmd.slice(1)}`}
              onClick={() => {
                onChange(`${s.cmd} `);
                ref.current?.focus();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200 hover:bg-secondary"
            >
              <span className="font-mono text-xs text-clay">{s.cmd}</span>
              <span className="text-xs text-muted-foreground">{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-200 focus-within:border-[#d5cfc4]">
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          data-testid="chat-input-textarea"
          aria-label="Message VEXION"
          placeholder={listening ? "Listening…" : "How can I help you today?"}
          className="vx-scroll max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
          <ModelPicker
            models={models}
            selected={selectedModel}
            onSelect={onSelectModel}
            authenticated={authenticated}
            onLockedPick={onLockedPick}
          />

          <div className="flex items-center gap-1">
            <span
              className="mr-1 hidden font-mono text-[10.5px] text-muted-foreground sm:inline"
              data-testid="token-counter"
            >
              {value.length ? `${value.length} ch · ~${Math.ceil(value.length / 4)} tok` : ""}
            </span>
            <button
              onClick={onMicToggle}
              disabled={!micAvailable}
              data-testid="mic-button"
              aria-label={listening ? "Stop listening" : "Start voice input"}
              title={micAvailable ? "Voice input" : "Speech recognition unavailable in this browser"}
              className={`rounded-lg p-2 transition-colors duration-200 disabled:opacity-35 ${
                listening
                  ? "bg-[#f6e7df] text-clay"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {micAvailable ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>

            {streaming ? (
              <button
                onClick={onStop}
                data-testid="stop-button"
                aria-label="Stop generation"
                className="rounded-lg bg-secondary p-2 text-foreground transition-colors duration-200 hover:bg-[#e6e2da]"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={!value.trim()}
                data-testid="send-button"
                aria-label="Send message"
                className="rounded-lg bg-clay p-2 text-white transition-colors duration-200 hover:bg-[#a34c29] disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
