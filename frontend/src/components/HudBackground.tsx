/** Rotating concentric HUD rings + drifting particles. Pure SVG/CSS, low cost. */
const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 41) % 100,
  top: (i * 67) % 100,
  delay: (i % 9) * 0.7,
  size: (i % 3) + 1,
}));

export default function HudBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
      data-testid="hud-background"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 700px at 50% 45%, rgba(62,198,255,.10), transparent 65%), radial-gradient(600px 500px at 85% 10%, rgba(255,176,62,.06), transparent 60%)",
        }}
      />
      <svg
        className="vx-spin-slow absolute left-1/2 top-1/2 h-[135vmin] w-[135vmin] -translate-x-1/2 -translate-y-1/2 opacity-[0.22]"
        viewBox="0 0 400 400"
      >
        <circle cx="200" cy="200" r="190" fill="none" stroke="#3ec6ff" strokeWidth="0.4" />
        <circle cx="200" cy="200" r="150" fill="none" stroke="#3ec6ff" strokeWidth="0.7" strokeDasharray="3 7" />
        <circle cx="200" cy="200" r="96" fill="none" stroke="#3ec6ff" strokeWidth="0.4" />
        {TICKS.map((deg) => (
          <line
            key={deg}
            x1="200"
            y1="14"
            x2="200"
            y2={deg % 15 === 0 ? "30" : "22"}
            stroke={deg % 45 === 0 ? "#ffb03e" : "#3ec6ff"}
            strokeWidth="0.7"
            transform={`rotate(${deg} 200 200)`}
          />
        ))}
      </svg>
      <svg
        className="vx-spin-rev absolute left-1/2 top-1/2 h-[78vmin] w-[78vmin] -translate-x-1/2 -translate-y-1/2 opacity-25"
        viewBox="0 0 400 400"
      >
        <circle cx="200" cy="200" r="180" fill="none" stroke="#3ec6ff" strokeWidth="0.8" strokeDasharray="60 22" />
        <circle cx="200" cy="200" r="130" fill="none" stroke="#ffb03e" strokeWidth="0.5" strokeDasharray="2 14" />
        <circle cx="200" cy="200" r="60" fill="none" stroke="#3ec6ff" strokeWidth="0.4" />
      </svg>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="vx-drift absolute rounded-full bg-[#3ec6ff]"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
