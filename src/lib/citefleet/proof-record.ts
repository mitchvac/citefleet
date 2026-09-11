// Browser-safe. The DNS record a customer has to add, as data a component can
// render — and the same sentence `proof.ts` puts in a failed check's note.
//
// WHY THIS IS A SEPARATE MODULE. `proof.ts` opens with
// `import { resolveTxt } from "node:dns/promises"`, and
// `client-bundle-guard.test.ts` refuses any component whose direct import
// resolves to a module with a top-level `node:` import (a route crashed exactly
// this way on 2026-09-02). So `proofHint` — which produces the one instruction
// a customer needs — could never be imported by a panel. It was reachable only
// as a tail on `proof.note`, rendered in the smallest text on the page, and only
// AFTER a check had already failed. Moving it here is what lets the record be
// shown BEFORE anyone asks, which is when it is actually useful.
//
// `proof.ts` re-exports `proofHint` and `wellKnownUrl` from here, so the note
// string it composes is byte-identical to what it was.

import type { Site } from "./types";
import { normalizeDomain, siteVerifyToken, verifyLine } from "./verify-token.ts";

export function wellKnownUrl(site: Pick<Site, "domain">): string {
  // `normalizeDomain`, not a bare www strip: it also lower-cases and removes a
  // scheme or path that found its way into the stored domain. The old version
  // left `WWW.Acme.com` — harmless over HTTP, but it disagreed with the apex
  // this same module reports for the DNS record, and two answers to one
  // question is how a customer ends up proving the wrong host.
  return `https://${normalizeDomain(site.domain)}/.well-known/botcentral.txt`;
}

/**
 * The record, field by field, exactly as a DNS panel asks for it.
 *
 * A pure function of the domain — no network, no stored state — so it renders
 * for a property that has never been checked, which is the whole point.
 */
export interface ProofRecord {
  /** Always TXT. */
  type: "TXT";
  /** The apex. Most panels call it `@`. */
  name: "@";
  /** The value to paste. */
  value: string;
  /** The bare domain, for panels that want it spelled out instead of `@`. */
  apex: string;
  /** What to type when a panel does not accept `@`. */
  nameNote: string;
  /** The mistake that breaks mail. */
  newRecordWarning: string;
  /** The same proof, served over HTTP instead. Either one alone is enough. */
  fileUrl: string;
}

export function proofRecord(site: Pick<Site, "domain">): ProofRecord {
  const apex = normalizeDomain(site.domain);
  return {
    type: "TXT",
    name: "@",
    value: verifyLine(siteVerifyToken(site)),
    apex,
    nameNote: `Some panels leave Name blank, or want ${apex} written out.`,
    // Lifted from docs/customer-setup.md, which no route serves — so this
    // warning has never reached the person who can act on it. Editing an
    // existing apex TXT record is how someone deletes their SPF line and stops
    // their own mail from being delivered.
    newRecordWarning:
      "Add this as a NEW record. Several TXT records on the apex are normal — " +
      "editing the one already there (usually SPF) will break your email.",
    fileUrl: wellKnownUrl(site),
  };
}

/**
 * What the operator or customer must add, as one sentence.
 *
 * DNS is named FIRST: it needs no deploy, it is the name BotCentral's verifier
 * actually queries (a bare apex TXT, SPEC 4.3), and it keeps proving when a
 * redeploy drops the origin pack. The file is the same line over HTTP. Either
 * one alone is enough.
 */
export function proofHint(site: Pick<Site, "domain">): string {
  const apex = normalizeDomain(site.domain);
  return (
    `Add an apex DNS TXT record - Type TXT, Name @, Value ${verifyLine(siteVerifyToken(site))} ` +
    `(in some panels Name is left blank, or is written ${apex}). ` +
    `Or serve that same line as plain text at ${wellKnownUrl(site)}.`
  );
}
