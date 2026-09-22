import { useEffect, useState } from "react";
import type { Site } from "@/lib/citefleet/types";
import type { VercelInstallResponse, VercelInstallStatus } from "@/lib/citefleet/vercel-install";

const ADVANCE = new Set<VercelInstallStatus>(["authorized", "installing", "building", "verifying"]);
const LABELS: Record<VercelInstallStatus, string> = {
  "authorization-pending": "Waiting for Vercel approval",
  authorized: "Vercel connected",
  installing: "Checking and adding the five files",
  building: "Waiting for the Vercel build",
  verifying: "Checking the five public URLs",
  verified: "All five files verified live",
  failed: "Installation needs attention",
};

export function VercelInstallPanel({ site }: { site: Site }) {
  const [result, setResult] = useState<VercelInstallResponse | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextMethod: "GET" | "POST" = "GET";
    setResult(null);
    setError("");
    const read = async () => {
      try {
        const advancing = nextMethod === "POST";
        const endpoint = advancing
          ? "/api/hosting/vercel/advance"
          : `/api/hosting/vercel/status?siteId=${encodeURIComponent(site.id)}`;
        const response = await fetch(endpoint, {
          method: nextMethod,
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          ...(advancing
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ siteId: site.id }),
              }
            : {}),
        });
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new Error(
            "Vercel installation returned an unexpected response. Reload or try again.",
          );
        }
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Sign in again to continue the installation."
              : `Could not check installation (${response.status}). Try again to resume.`,
          );
        }
        const data = (await response.json()) as VercelInstallResponse;
        if (
          typeof data.configured !== "boolean" ||
          typeof data.githubConnected !== "boolean" ||
          (data.job !== null && (!data.job || !(data.job.status in LABELS)))
        ) {
          throw new Error("Vercel installation returned an invalid status.");
        }
        if (controller.signal.aborted) return;
        setResult(data);
        setError("");
        if (data.configured && data.githubConnected) {
          nextMethod = data.job && ADVANCE.has(data.job.status) ? "POST" : "GET";
          const active =
            data.job &&
            (ADVANCE.has(data.job.status) || data.job.status === "authorization-pending");
          timer = setTimeout(() => void read(), active ? 5000 : 15000);
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Could not read installation status.");
      }
    };
    void read();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [site.id, retry]);

  const job = result?.job;
  const busy = !!job && (ADVANCE.has(job.status) || job.status === "authorization-pending");
  return (
    <div
      className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4"
      data-testid="vercel-install"
    >
      <h3 className="font-semibold text-white">Connect Vercel and install the five files</h3>
      <p className="mt-2 max-w-2xl text-sm text-[#b7b0cc]">
        Approve access to this website’s Vercel project. CiteFleet checks its connected GitHub
        repository, commits the files, starts a production deployment, and checks each file on{" "}
        {site.domain}. Existing files that CiteFleet does not own are left for your review.
      </p>
      {!result && !error && <p className="mt-3 text-sm text-[#b7b0cc]">Checking connection…</p>}
      {result && !result.configured && (
        <p className="mt-3 text-sm text-[#e2c36d]">
          Vercel connection is not enabled on this CiteFleet deployment yet. The GitHub installation
          above is still available.
        </p>
      )}
      {result && !result.githubConnected && (
        <p className="mt-3 text-sm text-[#e2c36d]">
          First{" "}
          <a href="#github-origin-install" className="underline">
            connect GitHub above
          </a>{" "}
          so CiteFleet can add the files to your repository.
        </p>
      )}
      {result?.configured && result.githubConnected && !busy && (
        <form
          method="post"
          target="citefleet-vercel-install"
          action="/api/hosting/vercel/start"
          className="mt-4"
        >
          <input type="hidden" name="siteId" value={site.id} />
          <button
            type="submit"
            title="Authorize Vercel, install the five files in the connected repository, and deploy this website"
            className="min-h-11 rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            {job?.status === "failed"
              ? "Retry with Vercel"
              : job?.status === "verified"
                ? "Check and deploy again"
                : "Connect Vercel and install files"}
          </button>
        </form>
      )}
      {job && (
        <div className="mt-4 text-sm" role="status" aria-live="polite">
          <p
            className={
              job.status === "failed"
                ? "font-semibold text-rose-300"
                : "font-semibold text-[#cfc8e8]"
            }
          >
            {LABELS[job.status]}
          </p>
          <p className="mt-1 break-words text-[#b7b0cc]">{job.message}</p>
          {job.projectName && (
            <p className="mt-1 text-xs text-[#9b95b3]">Vercel project: {job.projectName}</p>
          )}
          {job.verifiedPaths.length > 0 && (
            <p className="mt-2 break-words text-xs text-[#b7b0cc]">
              Verified: {job.verifiedPaths.join(", ")}
            </p>
          )}
          {busy && (
            <p className="mt-2 text-xs text-[#9b95b3]">
              Keep this page open while installation runs. If you reload, CiteFleet resumes the
              saved operation.
            </p>
          )}
        </div>
      )}
      {error && (
        <div className="mt-3 text-sm text-rose-300" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-2 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
