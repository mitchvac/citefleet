import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDnsSetupLinkFn,
  detectDnsProviderFn,
  dnsSetupSettingsFn,
} from "@/lib/citefleet/fleet-api";
import type { DnsAutomationSettings, DnsProviderDetection } from "@/lib/citefleet/dns-provider";
import {
  dnsProviderActions,
  DNS_MARKET_SOURCE,
  DNS_RESEARCH_DATE,
  ENTRI_AUTO_PROVIDER_SLUG,
  type DnsSetupLink,
} from "@/lib/citefleet/dns-provider";
import { DNS_PROVIDER_MARKET_SHARE, dnsProviderBySlug } from "@/lib/citefleet/dns-providers";
import type { Site } from "@/lib/citefleet/types";
import { Copy } from "./Copy";
import { DnsProviderPicker } from "./DnsProviderPicker";

function signedOut(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith("Unauthorized")) return false;
  window.location.assign("/login");
  return true;
}

export function DnsProviderPanel({ site }: { site: Site }) {
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
      const result = await detectDnsProviderFn({ data: { siteId: site.id } });
      if (request === detectionRequest.current) {
        setDetection(result);
        // A refreshed mixed or unknown delegation must not keep presenting the
        // provider detected by an older lookup as though it were still current.
        setSelected(result.provider?.slug ?? "");
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

  const provider = dnsProviderBySlug(selected);
  const actions = dnsProviderActions(provider, settings?.entri ?? null);
  const cloudflareGuided =
    detection?.status === "matched" &&
    detection.provider?.slug === "cloudflare" &&
    settings?.cloudflare.state === "ready";
  const entriGuided = actions.guided && !cloudflareGuided;

  async function startSetup() {
    if (!entriGuided) return;
    setBusy("setup");
    setError(null);
    try {
      const result = await createDnsSetupLinkFn({
        data: { siteId: site.id, providerSlug: provider?.slug ?? ENTRI_AUTO_PROVIDER_SLUG },
      });
      setSetupLink(result);
    } catch (cause) {
      if (!signedOut(cause))
        setError(cause instanceof Error ? cause.message : "Guided DNS setup failed.");
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
            Open the account that controls this record
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
        <DnsProviderPicker value={selected} onChange={setSelected} disabled={busy !== null} />
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

      {provider || entriGuided ? (
        <div className="mt-4">
          {provider ? (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[#cfc8e8]">
                  {provider.api.status === "public"
                    ? "Public API"
                    : provider.api.status === "restricted"
                      ? "Limited API"
                      : "API not verified"}
                </span>
                {provider.mcp.status === "official" ? (
                  <span className="rounded-full border border-[#4ee0c3]/30 bg-[#4ee0c3]/10 px-2.5 py-1 text-[#8ff0dc]">
                    Official MCP
                  </span>
                ) : null}
                {cloudflareGuided ? (
                  <span className="rounded-full border border-[#4ee0c3]/30 bg-[#4ee0c3]/10 px-2.5 py-1 text-[#8ff0dc]">
                    Automatic DNS connection
                  </span>
                ) : settings?.entri.state === "ready" && provider.entri !== "not-listed" ? (
                  <span className="rounded-full border border-[#9b7dff]/30 bg-[#9b7dff]/10 px-2.5 py-1 text-[#cbb8ff]">
                    {provider.entri === "automatic" ? "Guided setup" : "Guided by brand"}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-[#b7b0cc]">{provider.note}</p>
              {provider.api.caution ? (
                <p className="mt-1 text-xs text-[#e2c36d]">{provider.api.caution}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[#b7b0cc]">
              Entri can identify additional supported providers from this domain without a guessed
              market-share or account match.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {cloudflareGuided ? (
              <a
                href={`${settings.cloudflare.startPath}?siteId=${encodeURIComponent(site.id)}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2 text-sm font-semibold text-[#07060f]"
                data-testid="connect-cloudflare-dns"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" /> Connect Cloudflare
              </a>
            ) : entriGuided ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={startSetup}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2 text-sm font-semibold text-[#07060f] disabled:opacity-40"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                {busy === "setup"
                  ? "Creating secure link..."
                  : setupLink
                    ? "Create another link"
                    : "Create secure link"}
              </button>
            ) : null}
            {provider && actions.accountUrl ? (
              <a
                href={actions.accountUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" /> Open {provider.name}
              </a>
            ) : null}
            {provider ? (
              <a
                href={provider.guideUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#4ee0c3] underline"
              >
                Official TXT guide
              </a>
            ) : null}
            {provider?.api.docsUrl ? (
              <a
                href={provider.api.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#cbb8ff] underline"
              >
                API docs
              </a>
            ) : null}
            {provider?.mcp.docsUrl ? (
              <a
                href={provider.mcp.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[#cbb8ff] underline"
              >
                MCP docs
              </a>
            ) : null}
          </div>
          {setupLink ? (
            <div className="mt-3 border-t border-white/10 pt-3" data-testid="dns-secure-link">
              <p className="text-xs text-[#b7b0cc]">
                Ready for <span className="mono text-[#eee9ff]">{site.domain}</span>. Share only
                with the person who controls its DNS; a new link replaces this one&apos;s callback
                tracking.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={setupLink.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
                >
                  <ExternalLink aria-hidden="true" className="h-4 w-4" /> Open secure setup
                </a>
                <Copy label="secure DNS setup link" value={setupLink.link} size="control" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {settings?.entri.state === "misconfigured" ? (
        <p className="mt-3 text-xs text-rose-300">
          Guided DNS setup is disabled because its credentials or sharing host are incomplete or
          invalid.
        </p>
      ) : null}
      {detection?.provider?.slug === "cloudflare" &&
      settings?.cloudflare.state === "misconfigured" ? (
        <p className="mt-3 text-xs text-rose-300">
          Cloudflare connection is disabled because its OAuth client configuration is incomplete.
        </p>
      ) : null}
      {site.dnsSetup?.lastResult ? (
        <p
          className={`mt-3 text-xs ${site.dnsSetup.status === "verified" ? "text-[#8ff0dc]" : site.dnsSetup.status === "failed" ? "text-rose-300" : "text-[#cfc8e8]"}`}
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
      <p className="mt-4 text-[11px] text-[#77718e]">
        <a href={DNS_MARKET_SOURCE} target="_blank" rel="noreferrer" className="underline">
          {DNS_PROVIDER_MARKET_SHARE}% measured provider coverage
        </a>{" "}
        across 29 researched groups as checked {DNS_RESEARCH_DATE}. Entri can guide additional
        supported providers without turning them into an invented market-share claim.
      </p>
    </div>
  );
}
