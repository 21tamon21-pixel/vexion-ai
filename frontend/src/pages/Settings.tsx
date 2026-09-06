import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { apiPatch } from "@/lib/api";
import { useAppConfig, useAuth } from "@/hooks/useAuth";
import { ttsSupported, useVoice } from "@/hooks/useVoice";
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
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#d5cfc4]";
  const card = "rounded-xl border border-border bg-card p-6";

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          data-testid="back-to-chat-link"
          className="mb-6 inline-flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to chat
        </Link>

        <h1 className="font-heading text-2xl font-semibold tracking-tight">Settings</h1>

        <section className={`mt-6 space-y-4 ${card}`} data-testid="persona-section">
          <h2 className="text-[13px] font-semibold">Persona</h2>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={5}
            placeholder="Custom instructions — personality, tone, default behaviour."
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

        <section className={`mt-4 space-y-4 ${card}`} data-testid="voice-section">
          <h2 className="text-[13px] font-semibold">Voice</h2>
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
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(e) => setAutoSpeak(e.target.checked)}
                  data-testid="auto-speak-checkbox"
                  className="h-4 w-4 accent-[#b8552f]"
                />
                Read replies aloud automatically
              </label>
              <button
                onClick={() => voice.speak("Voice output is working.", voiceName)}
                data-testid="test-voice-button"
                className="rounded-lg border border-border px-3 py-1.5 text-[12.5px] transition-colors duration-200 hover:bg-secondary"
              >
                Test voice
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Speech synthesis is not available in this browser — voice output is disabled.
            </p>
          )}
        </section>

        <section className={`mt-4 ${card}`} data-testid="models-section">
          <h2 className="text-[13px] font-semibold">Models</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Tier 1 is free and open to guests. Tiers 2–5 need an account; paid plans are not
            connected yet, so every tier is currently available to signed-in users.
          </p>
          <ul className="mt-4 space-y-2.5">
            {(config?.models ?? []).map((m) => (
              <li key={m.id} className="flex items-start gap-3" data-testid={`model-row-${m.id}`}>
                <span className="mt-0.5 w-12 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                  tier {m.tier}
                </span>
                <span>
                  <span className="text-[13.5px] font-medium">{m.name}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{m.tagline}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`mt-4 ${card}`} data-testid="system-section">
          <h2 className="text-[13px] font-semibold">System</h2>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-[12.5px]">
            <dt className="text-muted-foreground">Account</dt>
            <dd data-testid="settings-email">{user?.email ?? "—"}</dd>
            <dt className="text-muted-foreground">Provider</dt>
            <dd data-testid="settings-provider">{config?.provider ?? "—"}</dd>
            <dt className="text-muted-foreground">Provider connected</dt>
            <dd className={config?.provider_ready ? "text-[#3f6b45]" : "text-clay"}>
              {config?.provider_ready ? "yes" : "no — mock responder active"}
            </dd>
            {config &&
              Object.entries(config.features).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                  <dd className={v ? "text-[#3f6b45]" : "text-muted-foreground"}>
                    {v ? "enabled" : "disabled"}
                  </dd>
                </div>
              ))}
          </dl>
        </section>

        <button
          onClick={save}
          disabled={saving}
          data-testid="save-settings-button"
          className="mt-6 rounded-lg bg-clay px-5 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#a34c29] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
