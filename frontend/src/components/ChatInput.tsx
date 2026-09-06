import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Mic, MicOff, Square } from "lucide-react";

/** Extension point: add an entry, get a command. Nothing else changes. */
export const SLASH_COMMANDS = [
  { cmd: "/summarize", hint: "Summarize the conversation so far" },
  { cmd: "/code", hint: "Answer with code only" },
  { cmd: "/math", hint: "Answer with full LaTeX working" },
  { cmd: "/diagram", hint: "Answer with a mermaid diagram" },
  { cmd: "/clear", hint: "Start a new session" },
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
  centered: boolean;
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
  centered,
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
    <div className={`relative w-full ${centered ? "max-w-2xl" : "max-w-3xl"}`}>
      {suggestions.length > 0 && (
        <div
          className="vx-glass absolute bottom-full mb-2 w-full rounded-md p-1"
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
              className="flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-colors duration-200 hover:bg-[#16243a]"
            >
              <span className="font-mono text-xs text-[#3ec6ff]">{s.cmd}</span>
              <span className="text-xs text-[#7f96b3]">{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={`vx-glass flex items-end gap-2 rounded-xl p-2 transition-shadow duration-300 ${
          listening ? "vx-pulse" : ""
        }`}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          data-testid="chat-input-textarea"
          aria-label="Message VEXION"
          placeholder={listening ? "Listening…" : "Transmit to VEXION…  (Enter to send, Shift+Enter for newline)"}
          className="vx-scroll max-h-[220px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-foreground outline-none placeholder:text-[#5c728c]"
        />

        <button
          onClick={onMicToggle}
          disabled={!micAvailable}
          data-testid="mic-button"
          aria-label={listening ? "Stop listening" : "Start voice input"}
          title={micAvailable ? "Voice input" : "Speech recognition unavailable in this browser"}
          className={`mb-0.5 rounded-lg p-2.5 transition-colors duration-200 disabled:opacity-30 ${
            listening ? "bg-[#ffb03e22] text-[#ffb03e]" : "text-[#7f96b3] hover:text-[#3ec6ff]"
          }`}
        >
          {micAvailable ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>

        {streaming ? (
          <button
            onClick={onStop}
            data-testid="stop-button"
            aria-label="Stop generation"
            className="mb-0.5 rounded-lg bg-[#ff5a6a22] p-2.5 text-[#ff8b96] transition-colors duration-200 hover:bg-[#ff5a6a33]"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            data-testid="send-button"
            aria-label="Send message"
            className="mb-0.5 rounded-lg bg-[#3ec6ff] p-2.5 text-[#04121c] transition-all duration-200 hover:shadow-[0_0_20px_-4px_#3ec6ff] disabled:cursor-not-allowed disabled:bg-[#1d2c44] disabled:text-[#5c728c] disabled:shadow-none"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex justify-between px-1 font-mono text-[10px] text-[#4a5f79]">
        <span>{value.startsWith("/") ? "slash command" : "enter ⏎ send · shift+⏎ newline"}</span>
        <span data-testid="token-counter">
          {value.length} ch · ~{Math.ceil(value.length / 4)} tok
        </span>
      </div>
    </div>
  );
}
