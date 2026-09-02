import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedEmails, isAllowedEmail } from "./operator-allowlist.ts";

test("allow-list parses commas/whitespace, lower-cases, ignores junk", () => {
  assert.deepEqual(allowedEmails({ CITEFLEET_OPERATOR_EMAILS: " Op@Example.com, two@x.io\nnot-an-email " }), ["op@example.com", "two@x.io"]);
  assert.deepEqual(allowedEmails({}), []);
});

test("fail closed: empty list refuses everyone; listed emails pass case-insensitively; others refused", () => {
  assert.equal(isAllowedEmail("op@example.com", {}), false);
  assert.equal(isAllowedEmail("op@example.com", { CITEFLEET_OPERATOR_EMAILS: "" }), false);
  const env = { CITEFLEET_OPERATOR_EMAILS: "op@example.com" };
  assert.equal(isAllowedEmail("OP@EXAMPLE.COM ", env), true, "positive control");
  assert.equal(isAllowedEmail("stranger@example.com", env), false);
  assert.equal(isAllowedEmail(null, env), false);
  assert.equal(isAllowedEmail("", env), false);
});
