import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiPost } from "@/lib/api";
import { useAppConfig } from "@/hooks/useAuth";
import HudBackground from "@/components/HudBackground";
import type { User } from "@/types";

export default function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: config } = useAppConfig();
  const appName = config?.app_name ?? "VEXION";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const body = mode === "login" ? { email, password } : { email, name, password };
      const user = await apiPost<User>(path, body);
      qc.setQueryData(["me"], user);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`Neural link established — welcome, ${user.name}`);
      navigate("/", { replace: true });
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? ((err.body as { detail?: string })?.detail ?? "Request rejected")
          : "Network unreachable";
      toast.error(typeof detail === "string" ? detail : "Invalid submission");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6">
      <HudBackground />
      <form
        onSubmit={submit}
        data-testid="auth-form"
        className="vx-glass vx-rise relative z-10 w-full max-w-sm rounded-2xl p-8"
      >
        <h1 className="vx-glow-text text-center font-heading text-3xl tracking-[0.4em] text-[#3ec6ff]">
          {appName}
        </h1>
        <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-[#5c728c]">
          {mode === "login" ? "identify yourself" : "register operator"}
        </p>

        <div className="mt-8 space-y-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Operator name"
              data-testid="auth-name-input"
              className="w-full rounded-md border border-[#1d2c44] bg-[#0a0e17] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#3ec6ff]"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="Email"
            data-testid="auth-email-input"
            className="w-full rounded-md border border-[#1d2c44] bg-[#0a0e17] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#3ec6ff]"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            placeholder="Passphrase (min 8 characters)"
            data-testid="auth-password-input"
            className="w-full rounded-md border border-[#1d2c44] bg-[#0a0e17] px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#3ec6ff]"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          data-testid="auth-submit-button"
          className="mt-6 w-full rounded-md bg-[#3ec6ff] py-2.5 font-mono text-xs uppercase tracking-[0.3em] text-[#04121c] transition-all duration-200 hover:shadow-[0_0_24px_-6px_#3ec6ff] disabled:opacity-50"
        >
          {busy ? "linking…" : mode === "login" ? "engage" : "create core"}
        </button>

        <button
          type="button"
          data-testid="auth-mode-toggle"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-[11px] text-[#5c728c] transition-colors duration-200 hover:text-[#3ec6ff]"
        >
          {mode === "login" ? "No core yet? Register" : "Already registered? Sign in"}
        </button>
      </form>
    </div>
  );
}
