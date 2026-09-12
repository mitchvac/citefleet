import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const snippet = read("deploy/nginx-security-headers.conf");
const bootstrap = read("deploy/nginx-citefleet.app.conf");
const deploy = read("deploy/deploy-vps.sh");
const release = read(".github/workflows/release.yml");

test("the nginx policy enforces the baseline response headers", () => {
  for (const name of [
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "X-Permitted-Cross-Domain-Policies",
    "Content-Security-Policy",
  ]) {
    assert.match(snippet, new RegExp(`add_header ${name} .+ always;`));
  }
  assert.match(snippet, /server_tokens off;/);
});

test("the CSP blocks dangerous defaults without breaking known CiteFleet origins", () => {
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://grok.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://botcentral.org https://grok.com https://*.grok.com",
    "frame-ancestors 'self' https://grok.com https://*.grok.com",
    "upgrade-insecure-requests",
  ]) {
    assert.ok(snippet.includes(directive), `missing CSP directive: ${directive}`);
  }
});

test("the deploy installs one policy used by bootstrap and generated TLS config", () => {
  assert.match(deploy, /install -m 644 deploy\/nginx-security-headers\.conf/);
  assert.match(bootstrap, /include \/etc\/nginx\/snippets\/citefleet-security-headers\.conf;/);
  assert.match(deploy, /include \/etc\/nginx\/snippets\/citefleet-security-headers\.conf;/);
});

test("the release verifies security headers at the public edge", () => {
  assert.match(release, /strict-transport-security/i);
  assert.match(release, /x-content-type-options/i);
  assert.match(release, /referrer-policy/i);
  assert.match(release, /permissions-policy/i);
  assert.match(release, /content-security-policy/i);
});
