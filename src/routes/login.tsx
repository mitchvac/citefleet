import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/citefleet/BrandLogo";
import { PublicFooter } from "@/components/citefleet/PublicFooter";
import { ShareApp } from "@/components/citefleet/ShareApp";
import { loginMessage } from "@/lib/auth/login-messages";
import { RESET_RESEND_SECONDS } from "@/lib/auth/password-reset";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [oauth, setOauth] = useState<{ google: boolean; github: boolean }>({
    google: true,
    github: true,
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    setError(loginMessage(code));
    // /api/forgot always redirects here with ?sent=1, whether or not the address
    // has an account — see handleForgot. The wording must not imply it did.
    setSent(params.get("sent") === "1");
    fetch("/api/oauth/providers")
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.google === "boolean") setOauth({ google: d.google, github: d.github });
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!sent) return;
    setResendSeconds(RESET_RESEND_SECONDS);
    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return seconds - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [sent]);

  const oauthSection = (
    <>
      <div className={`${mode === "forgot" ? "" : "mt-5 sm:mt-6"} space-y-2`}>
        <a
          href="/api/oauth/google"
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/5"
        >
          Continue with Google
        </a>
        <a
          href="/api/oauth/github"
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-sm hover:bg-white/5"
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
    </>
  );

  const divider = (label: string) => (
    <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[#9b95b3] sm:my-6">
      <span className="h-px flex-1 bg-white/10" />
      {label}
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );

  const emailForm = (
    <form
      method="post"
      action={mode === "forgot" ? "/api/forgot" : mode === "signup" ? "/api/signup" : "/api/login"}
      className={`${mode === "forgot" ? "mt-5" : ""} space-y-3`}
    >
      {mode === "signup" && (
        <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          Name
          <input
            name="name"
            autoComplete="name"
            className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
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
          className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
          placeholder="you@company.com"
        />
      </label>
      {mode !== "forgot" && (
        <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="mt-1 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
            placeholder="At least 8 characters"
          />
        </label>
      )}
      {mode === "signup" && (
        <p className="text-xs leading-5 text-[#9b95b3]" data-testid="signup-agreement">
          By creating an account, you agree to the{" "}
          <Link to="/terms" className="text-[#cfc8e8] underline hover:text-white">
            Terms
          </Link>{" "}
          and acknowledge the{" "}
          <Link to="/privacy" className="text-[#cfc8e8] underline hover:text-white">
            Privacy Notice
          </Link>
          .
        </p>
      )}
      <button className="min-h-11 w-full rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2.5 text-sm font-semibold text-[#07060f]">
        {mode === "forgot"
          ? "Email me a reset link"
          : mode === "signin"
            ? "Sign in"
            : "Create account"}
      </button>
      {mode === "signin" && (
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center text-center text-xs text-[#9b95b3] underline-offset-4 hover:text-[#cfc8e8] hover:underline"
          data-testid="forgot-password"
          onClick={() => {
            setMode("forgot");
            setError(null);
            setSent(false);
          }}
        >
          Forgot your password?
        </button>
      )}
    </form>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="grid flex-1 place-items-center px-3 py-6 sm:px-6 sm:py-12">
        <div className="glass w-full max-w-md rounded-2xl p-5 sm:rounded-3xl sm:p-8">
          {/* /login renders standalone — it does not use Shell, so it never
            inherited the header's Share app button. It is the FIRST page a
            signed-out visitor sees, because / bounces here, so it was the one
            public page from which the product could not be shared. */}
          <div className="flex items-start justify-between gap-3">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <BrandLogo size={48} className="h-11 w-11 sm:h-12 sm:w-12" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">CiteFleet</span>
                <span className="hidden text-[10px] uppercase tracking-[0.18em] text-[#9b95b3] min-[360px]:block sm:text-[11px]">
                  Your indexing workspace
                </span>
              </span>
            </Link>
            <ShareApp compact />
          </div>
          {/*
          Three modes, so three headings. This was a two-way ternary and
          `forgot` fell through to the else branch: pressing "Forgot your
          password?" retitled the page "Create your account" over an email field
          and an "Email me a reset link" button. The click worked — it just
          looked like it had gone wrong, which is the same thing to whoever
          pressed it.
        */}
          <h1 className="mt-5 text-2xl font-semibold sm:mt-6">
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create your account"
                : "Reset your password"}
          </h1>
          <p className="mt-2 text-sm text-[#b7b0cc]">
            {mode === "forgot" ? (
              <>
                Enter the email on your account. We will send a one-time link to set a new password.
                Google and GitHub sign-in still work below.
              </>
            ) : (
              <>
                Customers and operators sign in here. List a site, prove origin, and publish to
                BotCentral from this workspace.
              </>
            )}
          </p>
          {error && (
            <p
              className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
              data-testid="login-error"
            >
              {error}
            </p>
          )}
          {sent && !error && (
            <div
              className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200"
              data-testid="login-sent"
              aria-live="polite"
            >
              <p>
                If that address has a CiteFleet account, a reset link is on its way. It works once
                and expires in 30 minutes.
              </p>
              <button
                type="button"
                disabled={resendSeconds > 0}
                className="mt-1 inline-flex min-h-11 items-center text-xs font-medium underline underline-offset-4 disabled:cursor-wait disabled:no-underline disabled:opacity-70"
                onClick={() => {
                  setMode("forgot");
                  setSent(false);
                }}
              >
                {resendSeconds > 0
                  ? `Request another link in ${resendSeconds}s`
                  : "Request another reset link"}
              </button>
            </div>
          )}

          {mode === "forgot" ? (
            <>
              {emailForm}
              {divider("or sign in with")}
              {oauthSection}
            </>
          ) : (
            <>
              {oauthSection}
              {divider("or email")}
              {emailForm}
            </>
          )}
          <div className="mt-3 flex min-h-11 flex-wrap items-center justify-center gap-x-1 text-center text-sm text-[#9b95b3]">
            {mode === "signin" ? (
              <>
                New to CiteFleet?{" "}
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-[#4ee0c3] underline-offset-4 hover:underline"
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
                  className="inline-flex min-h-11 items-center text-[#4ee0c3] underline-offset-4 hover:underline"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
