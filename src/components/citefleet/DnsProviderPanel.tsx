import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDnsSetupLinkFn,
  detectDnsProviderFn,
  dnsSetupSettingsFn,
} from "@/lib/citefleet/fleet-api";
import type { DnsAutomationSettings, DnsProviderDetection } from "@/lib/citefleet/dns-provider";
import {
  dnsProviderActions,
  ENTRI_AUTO_PROVIDER_SLUG,
  type DnsSetupLink,
} from "@/lib/citefleet/dns-provider";
import { dnsProviderBySlug } from "@/lib/citefleet/dns-providers";
import type { Site } from "@/lib/citefleet/types";
import { Copy } from "./Copy";
import { DnsProviderPicker } from "./DnsProviderPicker";

function signedOut(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith("Unauthorized")) return false;
  window.location.assign("/login");
  return true;
}

export function DnsProviderPanel({
  site,
  onChanged,
}: {
  site: Site;
  onChanged: () => Promise<void>;
}) {
  const [detection, setDetection] = useState<DnsProviderDetection | null>(null);
  const [settings, setSettings] = useState<DnsAutomationSettings | null>(null);
  const [selected, setSelected] = useState("");
  const [setupLink, setSetupLink] = useState<DnsSetupLink | null>(null);
  const [busy, setBusy] = useState<"detect" | "setup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const detectionRequest = useRef(0);

  const detect = useCallback(async () => {
    const request = ++detectionRequest.current;
    setBusy("detect");
    setError(null);
    try {
      const next = await detectDnsProviderFn({ data: { siteId: site.id } });
      if (request === detectionRequest.current) {
        setDetection(next);
        setSelected(next.provider?.slug ?? "");
      }
    } catch (cause) {
      if (request === detectionRequest.current && !signedOut(cause)) {
        setError(cause instanceof Error ? cause.message : "DNS lookup failed.");
      }
    } finally {
      if (request === detectionRequest.current) setBusy(null);
    }
  }, [site.id]);

  useEffect(() => {
    let active = true;
    setDetection(null);
    setSelected("");
    setSetupLink(null);
    void detect();
    dnsSetupSettingsFn()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch((cause) => {
        if (active && !signedOut(cause)) {
          setError(cause instanceof Error ? cause.message : "DNS setup status failed.");
        }
      });
    return () => {
      active = false;
      detectionRequest.current += 1;
    };
  }, [detect]);

  useEffect(() => {
    if (site.dnsSetup?.status !== "writing" && site.dnsSetup?.status !== "propagating") return;
    let refreshing = false;
    const timer = window.setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      void onChanged().finally(() => {
        refreshing = false;
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [onChanged, site.dnsSetup?.status]);

  const provider = dnsProviderBySlug(selected);
  const actions = dnsProviderActions(provider, settings?.entri ?? null);
  const cloudflareGuided =
    detection?.status === "matched" &&
    detection.provider?.slug === "cloudflare" &&
    settings?.cloudflare.state === "ready";
  const porkbunSelected = provider?.slug === "porkbun";
  const entriGuided = actions.guided && !cloudflareGuided && !porkbunSelected;

  async function startSetup() {
    if (!entriGuided) return;
    setBusy("setup");
    setError(null);
    try {
      const next = await createDnsSetupLinkFn({
        data: { siteId: site.id, providerSlug: provider?.slug ?? ENTRI_AUTO_PROVIDER_SLUG },
      });
      setSetupLink(next);
    } catch (cause) {
      if (!signedOut(cause)) {
        setError(cause instanceof Error ? cause.message : "Guided DNS setup failed.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-5" data-testid="dns-provider-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">DNS provider</p>
          <h3 className="mt-1 text-base font-semibold">
            {provider
              ? `${provider.name} controls this domain`
              : "Detecting who controls this domain"}
          </h3>
        </div>
        <button
          type="button"
          title="Detect authoritative DNS provider again"
          aria-label="Detect authoritative DNS provider again"
          disabled={busy !== null}
          onClick={detect}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-[#cfc8e8] hover:bg-white/5 disabled:opacity-40"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${busy === "detect" ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="mt-3 max-w-xl">
        <DnsProviderPicker
          value={selected}
          disabled={busy !== null}
          onChange={(slug) => {
            setSelected(slug);
            setSetupLink(null);
            setError(null);
          }}
        />
      </div>

      <p className="mt-2 text-xs text-[#9b95b3]" data-testid="dns-detection-note">
        {busy === "detect" && !detection
          ? "Checking authoritative nameservers..."
          : detection
            ? detection.note
            : "Authoritative provider has not been checked."}
      </p>
      {detection?.nameservers.length ? (
        <p className="mono mt-1 break-all text-[11px] text-[#77718e]" data-testid="dns-nameservers">
          {detection.nameservers.join("  ")}
        </p>
      ) : null}

      {porkbunSelected ? (
        <div className="mt-4 max-w-xl">
          <div
            className="rounded-md border border-amber-300/30 bg-amber-300/10 p-3"
            data-testid="porkbun-api-prerequisite"
          >
            <p className="text-sm text-amber-100">
              <strong>Required once in Porkbun:</strong> open Domain Management, find {site.domain},
              select Details, and turn on API Access for this domain.
            </p>
            <a
              href="https://porkbun.com/account"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-300 underline"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" /> Enable API access for{" "}
              {site.domain}
            </a>
          </div>
          <p className="mt-3 text-sm text-[#b7b0cc]">
            Porkbun opens so the domain owner can sign in and approve CiteFleet. When they return,
            CiteFleet adds the blue record above and checks public DNS automatically.
          </p>
          <a
            href={`/api/dns/porkbun/start?siteId=${encodeURIComponent(site.id)}`}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-[#07111f] hover:bg-sky-300"
            data-testid="add-porkbun-txt"
          >
            <Plus aria-hidden="true" className="h-4 w-4" /> Add TXT record with Porkbun
          </a>
          <p className="mt-2 text-xs text-[#9b95b3]">
            Porkbun names the approval for {site.domain}. CiteFleet uses the generated key once and
            does not save it; remove that key from Porkbun API Access after verification.
          </p>
        </div>
      ) : cloudflareGuided ? (
        <a
          href={`${settings.cloudflare.startPath}?siteId=${encodeURIComponent(site.id)}`}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-[#07111f] hover:bg-sky-300"
          data-testid="connect-cloudflare-dns"
        >
          <ExternalLink aria-hidden="true" className="h-4 w-4" /> Connect Cloudflare
        </a>
      ) : entriGuided ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={startSetup}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-400 px-4 py-2 text-sm font-semibold text-[#07111f] hover:bg-sky-300 disabled:opacity-40"
        >
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          {busy === "setup"
            ? "Creating secure link..."
            : setupLink
              ? "Create another link"
              : "Connect DNS"}
        </button>
      ) : null}

      {setupLink ? (
        <div className="mt-3 border-t border-white/10 pt-3" data-testid="dns-secure-link">
          <p className="text-xs text-[#b7b0cc]">
            Secure setup is ready for <span className="mono text-white">{site.domain}</span>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={setupLink.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" /> Open secure setup
            </a>
            <Copy label="secure DNS setup link" value={setupLink.link} size="control" />
          </div>
        </div>
      ) : null}

      {site.dnsSetup?.lastResult ? (
        <p
          className={`mt-3 text-sm ${site.dnsSetup.status === "verified" ? "text-[#8ff0dc]" : site.dnsSetup.status === "failed" ? "text-rose-300" : "text-sky-200"}`}
          data-testid="dns-setup-status"
        >
          {site.dnsSetup.lastResult}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {provider ? (
        <details className="mt-4 text-sm text-[#b7b0cc]">
          <summary className="cursor-pointer text-xs text-[#9b95b3]">
            Add the record manually
          </summary>
          <p className="mt-2">Open {provider.name} and enter the blue record above exactly.</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {actions.accountUrl ? (
              <a
                href={actions.accountUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sky-300 underline"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" /> Open {provider.name}
              </a>
            ) : null}
            <a
              href={provider.guideUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sky-300 underline"
            >
              Official TXT instructions
            </a>
          </div>
        </details>
      ) : null}
    </div>
  );
}
