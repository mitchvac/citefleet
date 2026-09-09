import test from "node:test";
import assert from "node:assert/strict";
import { buildChecks } from "./reconcile.ts";
import type { Site, SiteMonitor, StoreShape } from "./types";

// Regression cover for the proof/ownership surface.
//
// "Origin proof" used to read `snap.wellKnown` — a probe of
// /.well-known/botcentral.txt and nothing else. An origin proven by an apex
// DNS TXT record serves no such file, so CiteFleet reported a verified
// customer as unproven while BotCentral's card said verified. The check now
// reads real proof state (either method) and the file probe moved to its own
// "Origin files" check, which is drift information, not proof.

const site = { id: "s1", name: "Acme", domain: "acme.com" } as unknown as Site;
const store = { tasks: [], control: undefined } as unknown as StoreShape;

type Snap = Omit<SiteMonitor, "checks" | "blockedByKill" | "drift">;

function snapshot(over: Partial<Snap>): Snap {
  return {
    siteId: "s1", name: "Acme", domain: "acme.com", url: "https://acme.com",
    at: new Date().toISOString(), probes: [], catalogListed: true,
    sitemapHttps: true, sitemapUrlCount: 3,
    wellKnown: true, proven: true, proofMethod: "well-known-file",
    proofNote: "", llms: true,
    ...over,
  } as Snap;
}

const find = (snap: Snap, id: string) =>
  buildChecks(site, snap, store).find((c) => c.id === id)!;

test("DNS-proven origin with NO file is proven, and the missing file is not an alarm", () => {
  const snap = snapshot({
    wellKnown: false,
    proven: true,
    proofMethod: "dns-txt",
    proofNote: "Token found in a DNS TXT record on acme.com.",
  });

  const proof = find(snap, "ownership");
  assert.equal(proof.ok, true, "a DNS-proven origin must read as proven");
  assert.equal(proof.severity, "ok");
  assert.match(proof.detail, /apex DNS TXT/);

  const files = find(snap, "origin-files");
  assert.equal(files.ok, false, "the file really is absent");
  assert.equal(files.severity, "info", "but proof is holding, so it is not a warning");
  assert.match(files.detail, /Proof is holding via DNS/);
});

test("file-proven origin reports proven by file, and the file check is clean", () => {
  const snap = snapshot({ wellKnown: true, proven: true, proofMethod: "well-known-file" });
  assert.equal(find(snap, "ownership").ok, true);
  assert.match(find(snap, "ownership").detail, /well-known\/botcentral\.txt/);
  assert.equal(find(snap, "origin-files").ok, true);
});

test("a snapshot stored BEFORE proof state existed does not read as unproven", () => {
  // The persisted payload is one JSONB blob; rows written before this shipped
  // carry no proven/proofMethod keys. Reading them as false would have flipped
  // every property to critical between deploy and the next monitor cycle.
  const legacy = snapshot({ wellKnown: true });
  delete (legacy as Record<string, unknown>).proven;
  delete (legacy as Record<string, unknown>).proofMethod;
  delete (legacy as Record<string, unknown>).proofNote;

  const proof = find(legacy, "ownership");
  assert.equal(proof.ok, true, "an old snapshot with a good file must stay proven");
  assert.equal(proof.severity, "ok");
  assert.match(proof.detail, /well-known\/botcentral\.txt/);

  const stale = snapshot({ wellKnown: false });
  delete (stale as Record<string, unknown>).proven;
  delete (stale as Record<string, unknown>).proofMethod;
  delete (stale as Record<string, unknown>).proofNote;
  assert.equal(find(stale, "ownership").ok, false, "old snapshot, no file: still unproven");
});

test("neither method proving is critical, and carries the verifier's own note", () => {
  const snap = snapshot({
    wellKnown: false,
    proven: false,
    proofMethod: "none",
    proofNote: "no TXT records on acme.com. Add an apex DNS TXT record - Type TXT, Name @, Value botcentral-verify=citefleet-app",
  });
  const proof = find(snap, "ownership");
  assert.equal(proof.ok, false);
  assert.equal(proof.severity, "critical", "no proof at all is not a warning");
  assert.match(proof.detail, /botcentral-verify=citefleet-app/);
  assert.equal(find(snap, "origin-files").severity, "warn");
});
