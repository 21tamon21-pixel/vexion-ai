import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  language: string;
  raw: string;
  children: ReactNode;
}

/** Fenced code block: language label, copy button, line numbers for long snippets. */
export default function CodeBlock({ language, raw, children }: Props) {
  const [copied, setCopied] = useState(false);
  const lines = raw.replace(/\n$/, "").split("\n");
  const numbered = lines.length > 8;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      toast.success("Code copied to clipboard");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  return (
    <div
      className="overflow-hidden rounded-md border border-[#1d2c44] bg-[#080c14]"
      data-testid="code-block"
    >
      <div className="flex items-center justify-between border-b border-[#1d2c44] bg-[#0b111c] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#7f96b3]">
          {language || "text"}
        </span>
        <button
          onClick={copy}
          data-testid="code-copy-button"
          aria-label="Copy code"
          className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#7f96b3] transition-colors duration-200 hover:bg-[#16243a] hover:text-[#3ec6ff]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="flex overflow-x-auto">
        {numbered && (
          <div
            aria-hidden="true"
            className="select-none border-r border-[#1d2c44] px-3 py-3 text-right font-mono text-xs leading-6 text-[#33465e]"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <pre className="flex-1 px-4 py-3 font-mono text-[13px] leading-6">
          <code className={`hljs language-${language}`}>{children}</code>
        </pre>
      </div>
    </div>
  );
}
