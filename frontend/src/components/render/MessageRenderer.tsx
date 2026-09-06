import { useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { ChevronRight, X } from "lucide-react";
import CodeBlock from "@/components/render/CodeBlock";
import Mermaid from "@/components/render/Mermaid";

function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  const el = node as { props?: { children?: ReactNode } };
  return el.props ? nodeText(el.props.children) : "";
}

/** Splits an optional <think>…</think> reasoning trace off the visible answer. */
function splitReasoning(text: string): { reasoning: string | null; body: string } {
  const match = text.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (!match) return { reasoning: null, body: text };
  return { reasoning: match[1].trim(), body: text.replace(match[0], "").trim() };
}

function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
      data-testid="image-lightbox"
      role="dialog"
      aria-label={alt || "Image preview"}
    >
      <button
        className="absolute right-6 top-6 text-[#7f96b3] transition-colors hover:text-[#3ec6ff]"
        aria-label="Close preview"
        data-testid="image-lightbox-close"
      >
        <X className="h-5 w-5" />
      </button>
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-md" />
    </div>
  );
}

/**
 * The single rendering pipeline for every AI/user message.
 * Add a content type by adding one entry to `components` below — the chat
 * interface never changes.
 */
export default function MessageRenderer({ content }: { content: string }) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const { reasoning, body } = useMemo(() => splitReasoning(content), [content]);

  return (
    <div className="vx-md" data-testid="message-renderer">
      {reasoning && (
        <div className="rounded-md border border-[#1d2c44] bg-[#0b111c]">
          <button
            onClick={() => setShowReasoning((v) => !v)}
            data-testid="reasoning-toggle"
            className="flex w-full items-center gap-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7f96b3] transition-colors duration-200 hover:text-[#3ec6ff]"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${showReasoning ? "rotate-90" : ""}`}
            />
            {showReasoning ? "hide reasoning" : "show reasoning"}
          </button>
          {showReasoning && (
            <pre
              data-testid="reasoning-body"
              className="whitespace-pre-wrap border-t border-[#1d2c44] px-3 py-2 font-mono text-xs text-[#8fa6c0]"
            >
              {reasoning}
            </pre>
          )}
        </div>
      )}

      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { ignoreMissing: true, detect: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }: ComponentPropsWithoutRef<"code">) => {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
            const isBlock = Boolean(className) || nodeText(children).includes("\n");
            if (!isBlock) {
              return <code {...rest}>{children}</code>;
            }
            const raw = nodeText(children);
            if (lang === "mermaid") return <Mermaid chart={raw.trim()} />;
            return (
              <CodeBlock language={lang} raw={raw}>
                {children}
              </CodeBlock>
            );
          },
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" data-testid="message-link">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? src : ""}
              alt={alt ?? ""}
              data-testid="message-image"
              onClick={() => setZoom({ src: typeof src === "string" ? src : "", alt: alt ?? "" })}
              className="max-h-96 cursor-zoom-in rounded-md border border-[#1d2c44] transition-transform duration-200 hover:scale-[1.01]"
            />
          ),
          table: ({ children }) => (
            <div className="vx-scroll overflow-x-auto rounded-md border border-[#1d2c44]">
              <table data-testid="message-table">{children}</table>
            </div>
          ),
        }}
      >
        {body}
      </Markdown>

      {zoom && <Lightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}
