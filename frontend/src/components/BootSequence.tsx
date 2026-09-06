import { useEffect, useMemo, useState } from "react";

const LINES = [
  "SYSTEM INITIALIZING",
  "CORE ONLINE",
  "VOICE SYSTEM READY",
  "NEURAL INTERFACE READY",
];

const STORAGE_KEY = "vexion.booted";

export function shouldBoot(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  return sessionStorage.getItem(STORAGE_KEY) !== "1";
}

export default function BootSequence({ appName, onDone }: { appName: string; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    if (reduced) {
      onDone();
      return;
    }
    const timers = LINES.map((_, i) => window.setTimeout(() => setStep(i + 1), 380 + i * 420));
    const end = window.setTimeout(onDone, 2200);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(end);
    };
  }, [onDone, reduced]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
      data-testid="boot-sequence"
    >
      <h1 className="vx-glow-text font-heading text-5xl tracking-[0.5em] text-[#3ec6ff] md:text-7xl">
        {appName}
      </h1>
      <ul className="mt-10 w-64 space-y-2 font-mono text-xs text-[#7f96b3]">
        {LINES.map((line, i) => (
          <li
            key={line}
            className="flex items-center justify-between transition-opacity duration-300"
            style={{ opacity: i < step ? 1 : 0.15 }}
          >
            <span>{line}</span>
            <span className={i < step ? "text-[#43e6b5]" : "text-[#1d2c44]"}>
              {i < step ? "OK" : "··"}
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={onDone}
        data-testid="boot-skip-button"
        className="mt-10 font-mono text-[11px] uppercase tracking-[0.3em] text-[#5c728c] transition-colors duration-200 hover:text-[#3ec6ff]"
      >
        skip
      </button>
    </div>
  );
}
