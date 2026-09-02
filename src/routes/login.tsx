import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/login")({ component: LoginPage });

const MESSAGES: Record<string, string> = {
  "bad-token": "That token was not accepted.",
  locked: "Too many attempts. Wait a minute, then try again.",
  "not-configured": "This server has no CITEFLEET_OPERATOR_TOKEN set. Add it to .env and redeploy.",
};

function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    setError(code ? (MESSAGES[code] ?? "Sign-in failed.") : null);
  }, []);
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form method="post" action="/api/login" className="glass w-full max-w-md rounded-3xl p-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">CiteFleet · Operator</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-[#b7b0cc]">
          Paste the operator token from the server’s <span className="mono">.env</span>. The console,
          every action, and the workspace data are behind this gate. Customer webhooks are not — they
          authenticate by signature.
        </p>
        {error && (
          <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200" data-testid="login-error">
            {error}
          </p>
        )}
        <label className="mt-6 block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          Operator token
          <input
            name="token"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
          />
        </label>
        <button className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2.5 text-sm font-semibold text-[#07060f]">
          Sign in
        </button>
      </form>
    </div>
  );
}
