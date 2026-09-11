import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { allowedEmails } from "./operator-allowlist.ts";

const here = import.meta.dirname;

test("renewal-recipient list parses commas/whitespace, lower-cases, ignores junk", () => {
  assert.deepEqual(
    allowedEmails({ CITEFLEET_OPERATOR_EMAILS: " Op@Example.com, two@x.io\nnot-an-email " }),
    ["op@example.com", "two@x.io"],
  );
  assert.deepEqual(allowedEmails({}), []);
});

test("account entry points do not consult the renewal-recipient list", () => {
  const files = ["operator.server.ts", "oauth.server.ts", "password-reset.server.ts"];
  const sources = files.map((file) => ({
    file,
    source: readFileSync(path.join(here, file), "utf8"),
  }));

  assert.match(
    sources[0].source,
    /export async function handleSignup/,
    "positive control: signup handler found",
  );
  assert.match(
    sources[0].source,
    /export async function handleLogin/,
    "positive control: login handler found",
  );
  assert.match(
    sources[1].source,
    /export async function finishOAuth/,
    "positive control: OAuth callback found",
  );
  assert.match(
    sources[2].source,
    /export async function requestReset/,
    "positive control: reset request found",
  );

  for (const { file, source } of sources) {
    assert.doesNotMatch(
      source,
      /operator-allowlist|isAllowedEmail|CITEFLEET_OPERATOR_EMAILS|not-allowed/,
      file,
    );
  }
});
