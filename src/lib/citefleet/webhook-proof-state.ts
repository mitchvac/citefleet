import type { Site } from "./types.ts";

type CheckedProof = NonNullable<Site["proof"]> & { attempts: number };

export function applyWebhookProof(
  site: Site,
  proof: CheckedProof,
  dnsSetupJobId: string | undefined,
  at: string,
): void {
  // A DNS-only failure does not disprove an independently valid proof file.
  if (!dnsSetupJobId || proof.proven) site.proof = proof;
  if (!dnsSetupJobId || site.dnsSetup?.jobId !== dnsSetupJobId) return;

  site.dnsSetup.status = proof.proven ? "verified" : "failed";
  site.dnsSetup.updatedAt = at;
  site.dnsSetup.lastResult = proof.proven
    ? `Independent proof check passed via ${proof.method}.`
    : proof.note;
}

export function recordWebhookResult(
  site: Site,
  result: string,
  at: string,
  options: { dnsSetupJobId?: string; dnsStatus?: "verified" | "failed" },
): void {
  if (!options.dnsSetupJobId) {
    if (site.webhook) site.webhook.lastResult = result;
    return;
  }
  if (site.dnsSetup?.jobId !== options.dnsSetupJobId) return;

  site.dnsSetup.lastResult = result;
  site.dnsSetup.updatedAt = at;
  if (options.dnsStatus) site.dnsSetup.status = options.dnsStatus;
}
