import { useEffect, useRef, useState } from "react";

let initialized = false;
let counter = 0;

/** Renders a ```mermaid fence as an actual diagram. Falls back to the source on error. */
export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!initialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: "neutral",
            securityLevel: "strict",
            themeVariables: {
              background: "#ffffff",
              primaryColor: "#f3f1ed",
              primaryTextColor: "#1f1e1c",
              primaryBorderColor: "#d5cfc4",
              lineColor: "#8a847a",
              fontFamily: "Inter Variable, sans-serif",
            },
          });
          initialized = true;
        }
        counter += 1;
        const { svg } = await mermaid.render(`vx-mermaid-${counter}`, chart);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "diagram error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <pre
        data-testid="mermaid-error"
        className="vx-scroll overflow-x-auto rounded-xl border border-border bg-muted/60 p-3 font-mono text-xs text-muted-foreground"
      >
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="mermaid-diagram"
      className="vx-scroll overflow-x-auto rounded-xl border border-border bg-card p-4 [&_svg]:mx-auto [&_svg]:max-w-full"
    />
  );
}
