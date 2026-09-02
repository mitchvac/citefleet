import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/login")({ component: LoginPage });

const MESSAGES: Record<string, string> = {
  "bad-credentials": "That email or password is not right.",
  exists: "An account with that email already exists. Sign in instead.",
  invalid: "Use a real email and a password of at least 8 characters.",
  "bad-token": "That sign-in was not accepted.",
  locked: "Too many attempts. Wait a minute, then try again.",
  "not-configured": "This server is not ready for sign-in yet.",
};

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    setError(code ? (MESSAGES[code] ?? "Sign-in failed.") : null);
  }, []);

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#9b7dff] to-[#4ee0c3] text-sm font-semibold text-[#07060f]">
            CF
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-wide">CiteFleet</span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-[#9b95b3]">
              Your indexing workspace
            </span>
          </span>
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">
          {mode === "signin" ? "Sign in" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-[#b7b0cc]">
          Customers and operators sign in here. List a site, prove origin, and
          publish to BotCentral from this workspace.
        </p>
        {error && (
          <p
            className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
            data-testid="login-error"
          >
            {error}
          </p>
        )}
        <form
          method="post"
          action={mode === "signup" ? "/api/signup" : "/api/login"}
          className="mt-6 space-y-3"
        >
          {mode === "signup" && (
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
              Name
              <input
                name="name"
                autoComplete="name"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
                placeholder="Your name"
              />
            </label>
          )}
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
              placeholder="you@company.com"
            />
          </label>
          <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
              placeholder="At least 8 characters"
            />
          </label>
          <button className="w-full rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2.5 text-sm font-semibold text-[#07060f]">
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-[#9b95b3]">
          {mode === "signin" ? (
            <>
              New to CiteFleet?{" "}
              <button
                type="button"
                className="text-[#4ee0c3] underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-[#4ee0c3] underline-offset-4 hover:underline"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
