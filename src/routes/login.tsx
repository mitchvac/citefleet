import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/citefleet/BrandLogo";

export const Route = createFileRoute("/login")({ component: LoginPage });

const MESSAGES: Record<string, string> = {
  "bad-credentials": "That email or password is not right.",
  exists: "An account with that email already exists. Sign in instead.",
  invalid: "Use a real email and a password of at least 8 characters.",
  "bad-token": "That sign-in was not accepted.",
  locked: "Too many attempts. Wait a minute, then try again.",
  "not-configured": "This server is not ready for sign-in yet.",
  "google-not-configured": "Google sign-in is not enabled on this server yet.",
  "github-not-configured": "GitHub sign-in is not enabled on this server yet.",
  "oauth-denied": "Sign-in was cancelled or expired. Try again.",
  "oauth-failed": "That provider could not complete sign-in. Try email, or try again.",
};

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [oauth, setOauth] = useState<{ google: boolean; github: boolean }>({ google: true, github: true });
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    setError(code ? (MESSAGES[code] ?? "Sign-in failed.") : null);
    fetch("/api/oauth/providers")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.google === "boolean") setOauth({ google: d.google, github: d.github });
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <Link to="/" className="flex items-center gap-3">
          <BrandLogo size={48} className="h-12 w-12" />
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

        <div className="mt-6 space-y-2">
          <a
            href="/api/oauth/google"
            className="flex w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/5"
          >
            Continue with Google
          </a>
          <a
            href="/api/oauth/github"
            className="flex w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/5"
          >
            Continue with GitHub
          </a>
        </div>
        {(!oauth.google || !oauth.github) && (
          <p className="mt-2 text-center text-[11px] text-[#9b95b3]">
            {!oauth.google && !oauth.github
              ? "Google and GitHub need OAuth apps on this server. Email still works."
              : !oauth.google
                ? "Google is not enabled yet. GitHub and email still work."
                : "GitHub is not enabled yet. Google and email still work."}
          </p>
        )}

        <div className="my-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
          <span className="h-px flex-1 bg-white/10" />
          or email
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form
          method="post"
          action={mode === "signup" ? "/api/signup" : "/api/login"}
          className="space-y-3"
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
