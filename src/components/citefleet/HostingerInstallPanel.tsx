import { useEffect, useState } from "react";
import type { Site } from "@/lib/citefleet/types";

type Job = {
  status: "queued" | "running" | "verified" | "failed";
  result: string | null;
  updatedAt: string;
};

export function HostingerInstallPanel({ site }: { site: Site }) {
  const [job, setJob] = useState<Job | null>(null);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [flowResult, setFlowResult] = useState("");
  useEffect(() => {
    setFlowResult(new URLSearchParams(window.location.search).get("hostinger") ?? "");
  }, []);
  useEffect(() => {
    if (site.provider?.slug !== "hostinger") return;
    let active = true;
    const read = async () => {
      try {
        const response = await fetch(
          `/api/hosting/hostinger/status?siteId=${encodeURIComponent(site.id)}`,
          { credentials: "same-origin", cache: "no-store" },
        );
        if (!response.ok) throw new Error(`Install status returned ${response.status}.`);
        const data = (await response.json()) as { job: Job | null; configured: boolean };
        if (active) {
          setJob(data.job);
          setConfigured(data.configured);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not read install status.");
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [site.id, site.provider?.slug]);
  if (site.provider?.slug !== "hostinger") return null;
  return (
    <section className="glass rounded-3xl p-5" data-testid="hostinger-install">
      <h2 className="text-lg font-semibold">Install files on Hostinger</h2>
      <p className="mt-2 max-w-2xl text-sm text-[#b7b0cc]">
        Sign in to your own Hostinger account and approve CiteFleet. The five files are installed
        only for this exact website after existing paths are checked. CiteFleet does not ask for
        your hosting password.
      </p>
      {configured ? (
        <a
          href={`/api/hosting/hostinger/start?siteId=${encodeURIComponent(site.id)}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Connect Hostinger and install files
        </a>
      ) : (
        <p className="mt-3 text-sm text-[#e2c36d]">CiteFleet has not enabled Hostinger sign-in for customer sites yet.</p>
      )}
      {flowResult === "denied" && <p className="mt-3 text-sm text-[#e2c36d]" role="status">Hostinger access was not approved.</p>}
      {flowResult === "unavailable" && <p className="mt-3 text-sm text-rose-300" role="alert">Hostinger sign-in could not start. CiteFleet has not changed your files.</p>}
      {flowResult === "failed" && !job && <p className="mt-3 text-sm text-rose-300" role="alert">Hostinger setup failed before installation.</p>}
      {job && (
        <p className="mt-3 text-sm text-[#cfc8e8]" role="status">
          {job.status === "queued" ? "Grok Bot accepted the install job. Waiting for file verification." :
            job.status === "running" ? "Installing and checking the five live files…" :
              job.status === "verified" ? "All five files verified live." : "Install needs attention."}
          {job.result ? ` ${job.result}` : ""}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
      <p className="mt-3 text-xs text-[#9b95b3]">
        Available for Hostinger Web/Cloud sites whose file paths pass CiteFleet’s safety check.
        Website Builder and sites without a writable .well-known folder need another install path.
      </p>
    </section>
  );
}
