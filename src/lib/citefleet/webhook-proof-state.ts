import type { Site } from "./types.ts";
import { dnsSetupOperationId } from "./dns-provider.ts";

type CheckedProof = NonNullable<Site["proof"]> & { attempts: number };

export function applyWebhookProof(
  site: Site,
  proof: CheckedProof,
  dnsOperationId: string | undefined,
  at: string,
): void {
  // A DNS-only failure does not disprove an independently valid proof file.
  if (!dnsOperationId || proof.proven) site.proof = proof;
  const setup = site.dnsSetup;
  if (!dnsOperationId || dnsSetupOperationId(setup) !== dnsOperationId || !setup) return;

  setup.status = proof.proven ? "verified" : "failed";
  setup.updatedAt = at;
  setup.lastResult = proof.proven
    ? `Independent proof check passed via ${proof.method}.`
    : proof.note;
}

export function recordWebhookResult(
  site: Site,
  result: string,
  at: string,
  options: { dnsSetupOperationId?: string; dnsStatus?: "verified" | "failed" },
): void {
  if (!options.dnsSetupOperationId) {
    if (site.webhook) site.webhook.lastResult = result;
    return;
  }
  const setup = site.dnsSetup;
  if (dnsSetupOperationId(setup) !== options.dnsSetupOperationId || !setup) return;

  setup.lastResult = result;
  setup.updatedAt = at;
  if (options.dnsStatus) setup.status = options.dnsStatus;
}
