import assert from "node:assert/strict";
import { test } from "node:test";
import { detectHosting } from "./hosting.ts";
import { hostingHint } from "./hosting-hint.ts";

const now = () => new Date("2026-09-02T14:00:00Z");
const none = async () => [] as string[];
const ours = async () => ["144.91.66.158"];

test("Vercel from headers (high), from CNAME (medium), from apex anycast A (medium)", async () => {
  const byHeader = await detectHosting({ domain: "x.app", headers: { server: "Vercel", "x-vercel-id": "iad1::abc" }, status: 200 }, { resolve4: none, resolveCname: none, citefleetIps: ours, now });
  assert.equal(byHeader.provider, "vercel");
  assert.equal(byHeader.confidence, "high");
  assert.equal(byHeader.deploysOnPush, true);
  assert.ok(byHeader.evidence.includes("x-vercel-id present"));
  const byCname = await detectHosting({ domain: "x.app", headers: { server: "nginx" }, status: 200 }, { resolve4: none, resolveCname: async (h) => (h.startsWith("www.") ? ["cname.vercel-dns.com."] : []), citefleetIps: ours, now });
  assert.equal(byCname.provider, "vercel");
  assert.equal(byCname.confidence, "medium");
  const byIp = await detectHosting({ domain: "x.app", headers: {}, status: 200 }, { resolve4: async () => ["216.150.1.193"], resolveCname: none, citefleetIps: ours, now });
  assert.equal(byIp.provider, "vercel");
});

test("Netlify and GitHub Pages from their headers; Cloudflare from cf-ray", async () => {
  const deps = { resolve4: none, resolveCname: none, citefleetIps: ours, now };
  assert.equal((await detectHosting({ domain: "n.app", headers: { server: "Netlify", "x-nf-request-id": "1" }, status: 200 }, deps)).provider, "netlify");
  assert.equal((await detectHosting({ domain: "g.app", headers: { server: "github.com" }, status: 200 }, deps)).provider, "github-pages");
  const cf = await detectHosting({ domain: "c.app", headers: { server: "cloudflare", "cf-ray": "abc" }, status: 200 }, deps);
  assert.equal(cf.provider, "cloudflare");
  assert.equal(cf.deploysOnPush, false);
});

test("self-hosted nginx on CiteFleet's own box is flagged as the same server", async () => {
  const r = await detectHosting({ domain: "citefleet.app", headers: { server: "nginx/1.24.0 (Ubuntu)" }, status: 200 }, { resolve4: async () => ["144.91.66.158"], resolveCname: none, citefleetIps: ours, now });
  assert.equal(r.provider, "self-hosted");
  assert.equal(r.sameServerAsCiteFleet, true);
  assert.ok(r.evidence.includes("same address as citefleet.app"));
  assert.match(hostingHint(r, "citefleet.app"), /same box as CiteFleet/);
});

test("unreachable: DNS points somewhere but nothing answers; no A record at all", async () => {
  const r = await detectHosting({ domain: "m.app", headers: null, status: null }, { resolve4: async () => ["144.91.66.158"], resolveCname: none, citefleetIps: ours, now });
  assert.equal(r.provider, "unreachable");
  assert.equal(r.sameServerAsCiteFleet, true);
  assert.ok(r.evidence.includes("no HTTP response"));
  const noA = await detectHosting({ domain: "m.app", headers: null, status: null }, { resolve4: async () => { throw new Error("ENOTFOUND"); }, resolveCname: none, citefleetIps: ours, now });
  assert.equal(noA.provider, "unreachable");
  assert.ok(noA.evidence.includes("no A record"));
  assert.match(hostingHint(r, "m.app"), /does not answer/);
});

test("unknown when reachable with no signature; DNS failures never throw", async () => {
  const r = await detectHosting({ domain: "u.app", headers: { "content-type": "text/html" }, status: 200 }, { resolve4: async () => { throw new Error("ETIMEOUT"); }, resolveCname: async () => { throw new Error("ENODATA"); }, citefleetIps: async () => { throw new Error("x"); }, now });
  assert.equal(r.provider, "unknown");
  assert.equal(r.confidence, "low");
  assert.equal(r.checkedAt, "2026-09-02T14:00:00.000Z");
  assert.match(hostingHint(undefined, "u.app"), /well-known\/botcentral\.txt/);
  assert.match(hostingHint(r, "u.app"), /DNS TXT/);
});

test("DNS at Vercel but nothing answers is Unreachable, never 'deploys on push'", async () => {
  const r = await detectHosting({ domain: "v.app", headers: null, status: null }, { resolve4: async () => ["216.150.1.193"], resolveCname: async () => ["cname.vercel-dns.com."], citefleetIps: ours, now });
  assert.equal(r.provider, "unreachable");
  assert.equal(r.deploysOnPush, false);
  assert.ok(r.evidence.some((e) => e.includes("DNS points at Vercel")));
  assert.match(hostingHint(r, "v.app"), /Deploy the site first/);
});

test("hint branches: deploys-on-push providers, Cloudflare, self-hosted elsewhere; unknown own address is noted", async () => {
  const deps = { resolve4: none, resolveCname: none, citefleetIps: ours, now };
  const v = await detectHosting({ domain: "x.app", headers: { server: "Vercel" }, status: 200 }, deps);
  assert.match(hostingHint(v, "x.app"), /Vercel deploys on push/);
  const cf = await detectHosting({ domain: "c.app", headers: { "cf-ray": "1" }, status: 200 }, deps);
  assert.match(hostingHint(cf, "c.app"), /Behind Cloudflare/);
  const sh = await detectHosting({ domain: "s.app", headers: { server: "Apache/2.4" }, status: 200 }, { resolve4: async () => ["203.0.113.5"], resolveCname: none, citefleetIps: ours, now });
  assert.equal(sh.sameServerAsCiteFleet, false);
  assert.match(hostingHint(sh, "s.app"), /redeploy s\.app/);
  const unknownOwn = await detectHosting({ domain: "s.app", headers: { server: "nginx" }, status: 200 }, { resolve4: async () => ["203.0.113.5"], resolveCname: none, citefleetIps: async () => [], now });
  assert.ok(unknownOwn.evidence.some((e) => e.includes("citefleet.app address unknown")));
});
