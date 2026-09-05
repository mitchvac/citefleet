import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/citefleet/BrandLogo";
import { loginMessage } from "@/lib/auth/login-messages";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-reset";

export const Route = createFileRoute("/reset")({ component: ResetPage });

/**
 * Where a reset link lands. Public by design — the token in the URL is the only
 * credential, and it is spent server-side by /api/reset.
 *
 * The token is NOT validated on render. Doing so would turn this page into an
 * oracle for whether a token is live, and it would mean two round trips to
 * learn what one POST already tells us. An expired or spent link fails on
 * submit and redirects to /login with the reason.
 */
function ResetPage() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") ?? "");
    setError(loginMessage(params.get("error")));
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="glass rounded-3xl p-8">
        <Link to="/" className="mb-6 flex items-center gap-3 no-underline">
          <BrandLogo className="h-10 w-10" />
          <span>
            <span className="block text-lg font-semibold text-white">CiteFleet</span>
            <span className="block text-[11px] uppercase tracking-[0.18em] text-[#9b95b3]">
              your indexing workspace
            </span>
          </span>
        </Link>

        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm text-[#b7b0cc]">
          This link works once. Once you set a password you will be signed in.
        </p>

        {error && (
          <p
            className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200"
            data-testid="reset-error"
          >
            {error}
          </p>
        )}

        {token ? (
          <form method="post" action="/api/reset" className="mt-6 space-y-3">
            <input type="hidden" name="token" value={token} />
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
              New password
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                autoFocus
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </label>
            <button
              className="w-full rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2.5 text-sm font-semibold text-[#07060f]"
              data-testid="reset-submit"
            >
              Set password and sign in
            </button>
          </form>
        ) : (
          <p className="mt-6 text-sm text-[#e2c36d]" data-testid="reset-no-token">
            This page needs the link from your email. Open the link directly, or{" "}
            <Link to="/login" className="underline">
              request a new one
            </Link>
            .
          </p>
        )}

        <p className="mt-5 text-center text-sm text-[#9b95b3]">
          <Link to="/login" className="text-[#4ee0c3] underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
