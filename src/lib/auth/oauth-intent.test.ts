import assert from "node:assert/strict";
import { test } from "node:test";
import { oauthStateValue, readOAuthIntent, requestedGithubSite } from "./oauth-intent.ts";

test("sign-in OAuth state remains provider-bound", () => {
  const value = oauthStateValue("google", "abc123");
  assert.equal(value, "google:abc123");
  assert.deepEqual(readOAuthIntent("google", "abc123", value), { kind: "sign-in" });
  assert.equal(readOAuthIntent("github", "abc123", value), null);
  assert.equal(readOAuthIntent("google", "wrong", value), null);
});

test("GitHub connection state is bound to the property and exact returned state", () => {
  const value = oauthStateValue("github", "d34db33f", {
    kind: "github-connect",
    siteId: "site-ac359f9c",
    userId: "1234567890abcdef1234567890abcdef",
  });
  assert.equal(value, "github-connect:site-ac359f9c:1234567890abcdef1234567890abcdef:d34db33f");
  assert.deepEqual(readOAuthIntent("github", "d34db33f", value), {
    kind: "github-connect",
    siteId: "site-ac359f9c",
    userId: "1234567890abcdef1234567890abcdef",
  });
  assert.equal(readOAuthIntent("github", "attacker", value), null);
  assert.equal(readOAuthIntent("google", "d34db33f", value), null);
});

test("invalid or ambiguous connection targets never enter OAuth state", () => {
  assert.equal(
    requestedGithubSite(
      new Request("https://citefleet.app/api/oauth/github?connect=site-ac359f9c"),
    ),
    "site-ac359f9c",
  );
  assert.equal(
    requestedGithubSite(new Request("https://citefleet.app/api/oauth/github?connect=site-other")),
    null,
  );
  assert.throws(
    () =>
      oauthStateValue("google", "abc", {
        kind: "github-connect",
        siteId: "site-ac359f9c",
        userId: "1234567890abcdef1234567890abcdef",
      }),
    /Invalid GitHub connection target/,
  );
  assert.throws(
    () =>
      oauthStateValue("github", "abc", {
        kind: "github-connect",
        siteId: "site-ac359f9c",
        userId: "another-account",
      }),
    /Invalid GitHub connection target/,
  );
});
