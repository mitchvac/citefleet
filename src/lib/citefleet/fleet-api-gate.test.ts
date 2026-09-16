import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

test("every createServerFn in fleet-api.ts is behind operatorMiddleware", () => {
  const src = readFileSync(path.resolve(import.meta.dirname, "fleet-api.ts"), "utf8");
  const fns = src.match(/createServerFn\(\{ method: "(GET|POST)" \}\)/g) ?? [];
  const gated = src.match(/\.middleware\(\[operatorMiddleware\]\)/g) ?? [];
  assert.ok(
    fns.length >= 18,
    `positive control: expected at least 18 server fns, found ${fns.length}`,
  );
  assert.equal(
    gated.length,
    fns.length,
    "a server fn is missing .middleware([operatorMiddleware])",
  );
  const orphan =
    /createServerFn\(\{ method: "(GET|POST)" \}\)(?!\s*\.middleware\(\[operatorMiddleware\]\))/;
  assert.equal(orphan.test(src), false, "createServerFn not immediately followed by the gate");
});

test("no other module in src defines a server fn", () => {
  const root = path.resolve(import.meta.dirname, "..", "..");
  const out = execSync(
    "grep -rl 'createServerFn(' --include='*.ts' --include='*.tsx' " + JSON.stringify(root),
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .map((f) => path.relative(root, f))
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .filter(
      (f) =>
        !/^lib\/auth\/middleware\.ts$/.test(f) &&
        !/^lib\/db\.ts$/.test(f) &&
        !/^lib\/app-data\//.test(f),
    );
  assert.deepEqual(out, ["lib/citefleet/fleet-api.ts"]);
});

test("DNS automation is bound to a stored property and the spend kill door", () => {
  const src = readFileSync(path.resolve(import.meta.dirname, "fleet-api.ts"), "utf8");
  const detection = src.slice(
    src.indexOf("export const detectDnsProviderFn"),
    src.indexOf("export const dnsSetupSettingsFn"),
  );
  assert.match(detection, /validator\(\(d: \{ siteId: string \}\)/);
  assert.doesNotMatch(detection, /domain:\s*string|host:\s*string/);
  assert.match(detection, /getSite\(await ws\.get\(\), data\.siteId\)/);
  assert.match(detection, /detectDnsProvider\(site\.domain\)/);

  const setup = src.slice(
    src.indexOf("export const createDnsSetupLinkFn"),
    src.indexOf("export const billingSettingsFn"),
  );
  assert.match(setup, /validator\(\(d: \{ siteId: string; providerSlug: string \}\)/);
  assert.doesNotMatch(setup, /domain:\s*string|record:\s*string|value:\s*string/);
  assert.match(setup, /const site = getSite\(store, data\.siteId\)/);
  assert.match(setup, /assertCanAct\(store, "spend"\)/);
  assert.match(setup, /data\.providerSlug === ENTRI_AUTO_PROVIDER_SLUG/);
  assert.match(setup, /if \(!provider && !automatic\)/);
  assert.match(setup, /if \(provider\?\.entri === "not-listed"\)/);
  assert.ok(
    setup.indexOf('assertCanAct(store, "spend")') <
      setup.indexOf("createDnsSetupLink(site, userId)"),
    "the spend door must be checked before the external link request",
  );
});

test("provider callbacks verify DNS itself beyond the negative-cache window", () => {
  const dispatcher = readFileSync(path.resolve(import.meta.dirname, "dispatcher.ts"), "utf8");
  assert.match(
    dispatcher,
    /const wait = opts\.dnsSetupOperationId \? waitForDnsProof : waitForProof/,
  );
  assert.match(
    dispatcher,
    /applyWebhookProof\(current, proof, opts\.dnsSetupOperationId/,
    "the dispatcher must use the tested exact-operation transition",
  );
  assert.match(
    dispatcher,
    /recordWebhookResult\(current, result/,
    "the dispatcher must keep Entri and repository hook results separate",
  );

  const route = readFileSync(
    path.resolve(import.meta.dirname, "..", "..", "routes", "api", "hooks", "entri.ts"),
    "utf8",
  );
  assert.match(route, /attempts: 12/);
  assert.match(route, /delayMs: 30_000/);
  assert.match(route, /dnsSetupOperationId: context\.jobId/);
  assert.match(route, /inFlightKey: context\.inFlightKey/);
  assert.match(route, /hookDeps\(\{ domain, dnsSetupJobId: jobId \}/);
  assert.ok((12 - 1) * 30_000 > 5 * 60_000);
});

test("Cloudflare DNS OAuth is property-bound and never accepts a browser-supplied domain", () => {
  const route = readFileSync(path.resolve(import.meta.dirname, "dns-oauth.server.ts"), "utf8");
  assert.match(route, /searchParams\.get\("siteId"\)/);
  assert.doesNotMatch(route, /searchParams\.get\("domain"\)/);
  assert.match(route, /const site = getSite\(store, siteId\)/);
  assert.match(route, /detectDnsProvider\(site\.domain\)/);
  assert.match(route, /consumeDnsOAuthState\(rawState, user\.id, "cloudflare"\)/);
  assert.match(route, /normalizeDomain\(site\.domain\) !== transaction\.domain/);
  assert.match(route, /dnsSetupOperationId\(site\.dnsSetup\) !== transaction\.operationId/);
  assert.match(route, /ensureCloudflareTxt\(token, record\.apex, record\.value\)/);
  assert.match(route, /revokeCloudflareToken\(token, config\)/);
  assert.doesNotMatch(route, /accessToken\s*:/);
});

test("Vercel DNS OAuth is property-bound, exact-domain, and discards authorization", () => {
  const route = readFileSync(
    path.resolve(import.meta.dirname, "vercel-dns-oauth.server.ts"),
    "utf8",
  );
  assert.match(route, /searchParams\.get\("siteId"\)/);
  assert.doesNotMatch(route, /searchParams\.get\("domain"\)/);
  assert.match(route, /const site = getSite\(store, siteId\)/);
  assert.match(route, /detectDnsProvider\(site\.domain\)/);
  assert.match(route, /consumeDnsOAuthState\([^;]*"vercel",?\s*\)/s);
  assert.match(route, /normalizeDomain\(site\.domain\) !== transaction\.domain/);
  assert.match(route, /dnsSetupOperationId\(site\.dnsSetup\) !== transaction\.operationId/);
  assert.match(route, /authorization\.teamId !== teamId/);
  assert.match(route, /ensureVercelTxt\(token, record\.apex, record\.value, teamId\)/);
  assert.match(route, /removeVercelIntegration\(token, configurationId, teamId\)/);
  assert.match(route, /token = ""/);
  assert.doesNotMatch(route, /dnsSetup\s*=\s*\{[^}]*accessToken/s);
});

test("Porkbun browser approval is property-bound and persists no generated API credential", () => {
  const route = readFileSync(
    path.resolve(import.meta.dirname, "porkbun-dns-oauth.server.ts"),
    "utf8",
  );
  assert.match(route, /searchParams\.get\("siteId"\)/);
  assert.doesNotMatch(route, /searchParams\.get\("domain"\)/);
  assert.doesNotMatch(route, /searchParams\.get\("apiKey"\)|searchParams\.get\("secretApiKey"\)/);
  assert.match(route, /const site = getSite\(store, siteId\)/);
  assert.match(route, /assertCanAct\(store, "spend"\)/);
  assert.match(route, /detectDnsProvider\(domain\)/);
  assert.match(route, /createPorkbunAuthorization\(domain\)/);
  assert.match(route, /consumePorkbunAuthorizationState\(requestToken, user\.id\)/);
  assert.match(route, /normalizeDomain\(site\.domain\) !== transaction\.domain/);
  assert.match(route, /dnsSetupOperationId\(site\.dnsSetup\) !== transaction\.operationId/);
  assert.match(route, /const record = proofRecord\(site\)/);
  assert.match(route, /ensurePorkbunTxt\([\s\S]*record\.apex,[\s\S]*record\.value/);
  assert.match(route, /credentials = null/);
  assert.doesNotMatch(route, /dnsSetup\s*=\s*\{[^}]*apiKey/s);
  assert.doesNotMatch(route, /dnsSetup\s*=\s*\{[^}]*secretApiKey/s);
});

test("new onboarding persists a generated versioned proof token", () => {
  const dispatcher = readFileSync(path.resolve(import.meta.dirname, "dispatcher.ts"), "utf8");
  const onboard = dispatcher.slice(
    dispatcher.indexOf("export async function onboardSite"),
    dispatcher.indexOf("export async function dispatchSite"),
  );
  assert.match(onboard, /verifyToken: createSiteVerifyToken\(\)/);
  assert.doesNotMatch(onboard, /verifyToken: siteVerifyToken/);
});
