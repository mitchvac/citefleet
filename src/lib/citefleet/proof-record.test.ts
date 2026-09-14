import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { proofHint, proofRecord, wellKnownUrl } from "./proof-record.ts";
import { proofHint as reExported } from "./proof.ts";

test("the record is the three fields a DNS panel asks for", () => {
  const r = proofRecord({ domain: "acme.com" });
  assert.equal(r.type, "TXT");
  assert.equal(r.name, "@");
  assert.equal(r.value, "botcentral-verify=citefleet-app");
  assert.equal(r.apex, "acme.com");
});

test("www is stripped — the record belongs on the apex", () => {
  // BotCentral's verifier queries the bare apex (SPEC 4.3). A record on
  // www.acme.com proves nothing.
  const r = proofRecord({ domain: "www.acme.com" });
  assert.equal(r.apex, "acme.com");
  assert.equal(r.fileUrl, "https://acme.com/.well-known/botcentral.txt");
});

test("the record warns about the mistake that breaks mail", () => {
  // Editing the existing apex TXT record usually means overwriting SPF. This
  // sentence lived only in docs/customer-setup.md, which no route serves.
  const r = proofRecord({ domain: "acme.com" });
  assert.match(r.newRecordWarning, /NEW record/);
  assert.match(r.newRecordWarning, /email/i);
});

test("the record renders with no network and no stored state", () => {
  // The whole point: it is shown BEFORE any check has run, to a customer who
  // has done nothing yet.
  const r = proofRecord({ domain: "never-checked.example" });
  assert.ok(r.value.length > 0);
  assert.ok(r.fileUrl.startsWith("https://"));
});

test("proof.ts re-exports the same function, so its note is unchanged", () => {
  // proofHint moved out of proof.ts into a browser-safe module. If the two ever
  // diverge, checkOriginProof's failure note silently changes.
  assert.equal(reExported, proofHint);
  assert.equal(
    proofHint({ domain: "acme.com" }),
    "Add an apex DNS TXT record - Type TXT, Name @, Value botcentral-verify=citefleet-app " +
      "(in some panels Name is left blank, or is written acme.com). " +
      "Or serve that same line as plain text at https://acme.com/.well-known/botcentral.txt.",
  );
});

test("wellKnownUrl and the DNS apex agree on the host, whatever was stored", () => {
  // Two answers to "which host are we proving?" is how a customer proves the
  // wrong one. Both must normalise identically.
  for (const stored of ["acme.com", "www.acme.com", "WWW.Acme.com", "https://acme.com/x"]) {
    const r = proofRecord({ domain: stored });
    assert.equal(r.apex, "acme.com", stored);
    assert.equal(
      wellKnownUrl({ domain: stored }),
      "https://acme.com/.well-known/botcentral.txt",
      stored,
    );
    assert.equal(r.fileUrl, wellKnownUrl({ domain: stored }));
  }
});

test("the customer doc requires the property's displayed token", () => {
  const doc = readFileSync(
    fileURLToPath(new URL("../../../docs/customer-setup.md", import.meta.url)),
    "utf8",
  );
  assert.ok(doc.length > 200, "positive control: the doc was read");
  assert.match(doc, /botcentral-verify=<the unique token shown on this property's campaign>/);
  assert.match(doc, /Existing properties[\s\S]*botcentral-verify=citefleet-app/);
});
