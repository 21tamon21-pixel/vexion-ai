import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { useAppConfig } from "@/hooks/useAuth";
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
      // Confirm the session cookie actually stuck before navigating — an
      // optimistic cache write used to hide a dropped cookie and every later
      // write then failed with 401 ("could not start a chat").
      const me = await apiGet<User | null>("/auth/me");
      if (!me) {
        toast.error("Signed in, but the session cookie was rejected by this browser");
        return;
      }
      qc.setQueryData(["me"], me);
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(`Welcome, ${user.name}`);
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

  const field =
    "w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus:border-[#d5cfc4]";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-heading text-[26px] font-semibold tracking-tight">
          {appName}
        </h1>
        <p className="mt-1.5 text-center text-[13px] text-muted-foreground">
          {mode === "login" ? "Sign in to save your chats" : "Create an account"}
        </p>

        <form onSubmit={submit} data-testid="auth-form" className="mt-7 space-y-3">
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Your name"
              data-testid="auth-name-input"
              className={field}
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="Email"
            data-testid="auth-email-input"
            className={field}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            minLength={8}
            placeholder="Password (at least 8 characters)"
            data-testid="auth-password-input"
            className={field}
          />

          <button
            type="submit"
            disabled={busy}
            data-testid="auth-submit-button"
            className="w-full rounded-lg bg-[#b8552f] py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#a34c29] disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          data-testid="auth-mode-toggle"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-[12.5px] text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          {mode === "login" ? "No account? Create one" : "Already have an account? Sign in"}
        </button>

        <Link
          to="/"
          data-testid="continue-as-guest-link"
          className="mt-6 block text-center text-[12.5px] text-[#b8552f] underline"
        >
          Continue as a guest instead
        </Link>
      </div>
    </div>
  );
}
