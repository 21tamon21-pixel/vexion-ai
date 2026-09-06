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
            theme: "dark",
            securityLevel: "strict",
            themeVariables: {
              background: "#0d1420",
              primaryColor: "#16243a",
              primaryTextColor: "#dfe9f5",
              primaryBorderColor: "#3ec6ff",
              lineColor: "#3ec6ff",
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
        className="overflow-x-auto rounded-md border border-[#ff5a6a55] bg-[#0a0e17] p-3 font-mono text-xs text-[#ff9aa5]"
      >
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      data-testid="mermaid-diagram"
      className="vx-glass overflow-x-auto rounded-md p-4 [&_svg]:mx-auto [&_svg]:max-w-full"
    />
  );
}
