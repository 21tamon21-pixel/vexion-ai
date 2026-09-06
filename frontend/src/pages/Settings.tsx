import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { apiPatch } from "@/lib/api";
import { useAppConfig, useAuth } from "@/hooks/useAuth";
import { ttsSupported, useVoice } from "@/hooks/useVoice";
import HudBackground from "@/components/HudBackground";
import type { User } from "@/types";

export default function Settings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading } = useAuth();
  const { data: config } = useAppConfig();
  const voice = useVoice(
    () => undefined,
    (m) => toast.error(m),
  );

  const [systemPrompt, setSystemPrompt] = useState("");
  const [tone, setTone] = useState("precise");
  const [verbosity, setVerbosity] = useState("balanced");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceName, setVoiceName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    setSystemPrompt(user.persona.system_prompt);
    setTone(user.persona.tone);
    setVerbosity(user.persona.verbosity);
    setAutoSpeak(user.persona.auto_speak);
    setVoiceName(user.persona.voice_name);
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiPatch<User>("/auth/persona", {
        system_prompt: systemPrompt,
        tone,
        verbosity,
        auto_speak: autoSpeak,
        voice_name: voiceName,
      });
      qc.setQueryData(["me"], updated);
      toast.success("Persona configuration saved");
    } catch {
      toast.error("Could not save configuration");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-md border border-[#1d2c44] bg-[#0a0e17] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#3ec6ff]";

  return (
    <div className="relative min-h-screen bg-background px-6 py-10">
      <HudBackground />
      <div className="relative z-10 mx-auto max-w-2xl">
        <Link
          to="/"
          data-testid="back-to-chat-link"
          className="mb-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-[#5c728c] transition-colors duration-200 hover:text-[#3ec6ff]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back to console
        </Link>

        <h1 className="vx-glow-text font-heading text-2xl tracking-[0.25em] text-[#3ec6ff]">
          CONFIGURATION
        </h1>

        <section className="vx-glass mt-6 space-y-4 rounded-xl p-6" data-testid="persona-section">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#7f96b3]">
            Persona
          </h2>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            placeholder="Operator directives — define personality, tone and default behaviour."
            data-testid="system-prompt-input"
            className={`${field} resize-none`}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              data-testid="tone-select"
              className={field}
            >
              {["precise", "warm", "formal", "playful", "terse"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={verbosity}
              onChange={(e) => setVerbosity(e.target.value)}
              data-testid="verbosity-select"
              className={field}
            >
              {["brief", "balanced", "detailed"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="vx-glass mt-4 space-y-4 rounded-xl p-6" data-testid="voice-section">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#7f96b3]">Voice</h2>
          {ttsSupported() ? (
            <>
              <select
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                data-testid="voice-select"
                className={field}
              >
                <option value="">System default voice</option>
                {voice.voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-3 text-sm text-[#a9c2da]">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(e) => setAutoSpeak(e.target.checked)}
                  data-testid="auto-speak-checkbox"
                  className="h-4 w-4 accent-[#3ec6ff]"
                />
                Speak responses automatically
              </label>
              <button
                onClick={() => voice.speak("Voice system online. All modules nominal.", voiceName)}
                data-testid="test-voice-button"
                className="rounded-md border border-[#1d2c44] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#7f96b3] transition-colors duration-200 hover:border-[#3ec6ff] hover:text-[#3ec6ff]"
              >
                test voice
              </button>
            </>
          ) : (
            <p className="text-sm text-[#ffb03e]">
              Speech synthesis is not available in this browser — voice output is disabled.
            </p>
          )}
        </section>

        <section className="vx-glass mt-4 rounded-xl p-6" data-testid="system-section">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#7f96b3]">
            System state
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 font-mono text-[11px] text-[#8fa6c0]">
            <dt className="text-[#5c728c]">Account</dt>
            <dd data-testid="settings-email">{user?.email ?? "—"}</dd>
            <dt className="text-[#5c728c]">Brain provider</dt>
            <dd data-testid="settings-provider">{config?.provider ?? "—"}</dd>
            <dt className="text-[#5c728c]">Model</dt>
            <dd>{config?.model ?? "—"}</dd>
            <dt className="text-[#5c728c]">Provider connected</dt>
            <dd style={{ color: config?.provider_ready ? "#43e6b5" : "#ffb03e" }}>
              {config?.provider_ready ? "yes" : "no — mock responder active"}
            </dd>
            {config &&
              Object.entries(config.features).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-[#5c728c]">{k}</dt>
                  <dd style={{ color: v ? "#43e6b5" : "#5c728c" }}>{v ? "enabled" : "disabled"}</dd>
                </div>
              ))}
          </dl>
        </section>

        <button
          onClick={save}
          disabled={saving}
          data-testid="save-settings-button"
          className="mt-6 rounded-md bg-[#3ec6ff] px-6 py-2.5 font-mono text-xs uppercase tracking-[0.3em] text-[#04121c] transition-all duration-200 hover:shadow-[0_0_24px_-6px_#3ec6ff] disabled:opacity-50"
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
    </div>
  );
}
