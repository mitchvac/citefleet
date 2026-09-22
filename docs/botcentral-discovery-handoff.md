# STEP 0 — Load governance before coding

Use the Prime Directive skill. Locate and read this repository's PRIME_DIRECTIVE and root/scoped AGENTS.md; use the skill's bundled fallback if no local directive exists. Declare the version and current phase. Follow Planner → Dependency/Conflict → Coder → independent cold Validator. Verify every referenced API, file and schema from source. Update repository maps, run full tests and real integration tests. Report untested paths explicitly. Do not assume CiteFleet's proposed endpoint already exists in BotCentral.

## Build this feature

Implement compact hosted discovery for CiteFleet. BotCentral stores a small website description, selected page links, topics and exactly five generated text files. Visitors and AI clients follow the original website URL for content. Do not copy, crawl or store the entire customer website.

Two customer paths converge on this interface:

1. Customer submits their website through CiteFleet's compact discovery form, including when their host cannot install the files.
2. An authorized AI application submits the same compact record to CiteFleet using its customer's workspace bearer key. CiteFleet generates the files and forwards the record here.

CiteFleet owns customer authentication and generation. BotCentral owns durable receipt, public discovery record, hosted file copies, and discovery through its existing search/API/MCP surfaces. Read those surfaces before extending them. Do not claim external AI platforms automatically adopt this registry.

## Exact CiteFleet contract to implement

Authoritative caller: `src/lib/citefleet/discovery.server.ts` (`buildDiscoveryRequest`, `forwardDiscovery`, `readDiscoveryReceipt`) and `discovery.ts` in the CiteFleet feature branch. Obtain these sources with this prompt. Implement `POST /internal/discovery` on `BOTCENTRAL_URL` (default `https://botcentral.org`). This is a NEW endpoint, independent of the existing origin-verified `/internal/publish`.

Headers:

- `Authorization: Bearer <BOTCENTRAL_SERVICE_TOKEN>`; validate the configured server credential. Never expose it to browsers or public records.
- `Content-Type: application/json`
- `Idempotency-Key: <idempotencyKey>`; must equal body.

Bound input to 65,536 UTF-8 bytes. Reject unknown fields, malformed JSON, invalid paths/hashes and unauthorized requests. Request fields:

```ts
{
  publisherRecordId: string; // lowercase SHA256, tenant-scoped opaque ID
  version: "citefleet-discovery-v1";
  mode: "hosted";
  record: {
    name: string;       // nonempty, max 200 JS string units
    url: string;        // HTTPS origin, no trailing slash
    summary: string;    // nonempty, max 1200
    pages: {url:string; title:string}[]; // max 20, title max 200
    topics: string[];   // max 10, each max 80
  };
  originOwnership: "observed" | "unknown";
  files: {path:string; content:string; sha256:string}[];
  keyPrefix?: string; // optional existing billing attribution, never a public secret
  revision: number;   // positive safe integer
  digest: string;
  idempotencyKey: string;
}
```

URL rules: public DNS hostname, HTTPS only, no credentials, query, fragment or nondefault port; record URL is origin only; page URLs belong to the same origin, are unique, and omit private `/api`, `/admin`, `/settings` paths. Match the actual CiteFleet parser; do not invent more permissive interpretations. Strings reject controls and angle brackets. Neither service needs to fetch arbitrary user URLs during acceptance.

Five allowed file paths (no leading slash): `robots.txt`, `sitemap.xml`, `llms.txt`, `.well-known/botcentral.txt`, and `<IndexNow-key>.txt`. Validate the fifth filename/content with the actual IndexNow key rule in CiteFleet `indexnow.ts`, and ensure exactly one of each. Store supplied bytes without rewriting. Every SHA256 is lowercase hex over UTF-8 content. No arbitrary uploaded files, traversal or executable content.

Identity/digest algorithm (exactly match CiteFleet):

1. `publisherRecordId = SHA256(workspaceId + "\n" + site.id)`; BotCentral receives only the opaque result. Bind it to the authenticated publishing service; do not accept another service's record ID.
2. Reconstruct the digest body in this JSON insertion order: `publisherRecordId`, `version`, `mode`, `record`, `originOwnership`, `files`, and `keyPrefix` only when present. Record order is `name,url,summary,pages,topics`; page order is `url,title`; file order is the request's array order, object keys `path,content,sha256`. Hash `JSON.stringify(body)` UTF-8 with SHA256. Do not include revision, digest, idempotency key or timestamps.
3. `idempotencyKey = SHA256(publisherRecordId + "\n" + revision + "\n" + digest)`.
4. Same content retry keeps revision/key. Changed content increments the persisted revision. Atomically reject stale revisions or same revision/different digest. A retry of a previously accepted request returns its identical receipt without rolling back a newer record or billing twice.

Persist metadata, all five file bytes/hashes, revision and receipt atomically (or stage blobs then atomically expose the record). A lost HTTP response must be safely retryable. Never return accepted before durable persistence. Return 200 (replay) or 201 (new acceptance), application/json, with EXACTLY these fields:

```ts
{
  version: "citefleet-discovery-v1",
  status: "accepted",
  publisherRecordId: "<exact request value>",
  revision: 1, // exact request value
  idempotencyKey: "<exact request value>",
  digest: "<exact request value>",
  url: "https://botcentral.org/<public-record-path>",
  files: [
    {path:"robots.txt", sha256:"<exact request hash>", url:"https://botcentral.org/<record-file-path>"}
    // all five, unique, paths and hashes exactly matching request
  ]
}
```

Receipt JSON is limited to 65,536 UTF-8 bytes. Each receipt URL is limited to 2,048 JavaScript string units and must be public HTTPS on the configured BotCentral origin, without credentials, nondefault port, query or fragment (explicit :443 is normalized). Apply the exact `discoveryUrl` validator, including reserved hostname suffixes, raw backslash/angle-bracket/square-bracket/parenthesis rejection and its percent-encoded control restrictions. Do not redirect this endpoint. CiteFleet allows 10 seconds per attempt, at most two attempts for transport failure or HTTP 429/502/503/504; ensure idempotency across retries. Use 401/403 unauthorized, 400/422 invalid, 409 conflicting revision and 429 limited. Keep errors generic, bounded and free of secrets.

## Public behavior and trust

Provide a compact public profile with original URL and selected page links, plus JSON and the five file links. Integrate discovery results into the existing BotCentral search/fetch/MCP interface using its actual conventions. Escape all publisher strings; serve file content as inert text/XML with correct content types and nosniff. Keep per-record file namespaces; customer copies must never replace BotCentral's own root robots.txt, sitemap or ownership files.

Store discovery separately from verified catalogue ownership. `originOwnership:"observed"` is CiteFleet's observation, NOT permission to promote a record to BotCentral verified ownership. Independently follow existing proof rules if verification is desired. A second publisher submitting the same origin must not overwrite another publisher's record or verified listing. Expose provenance and verification status clearly.

Hosted copies do not alter the customer's original robots policy, verify their domain, or complete IndexNow on their origin. Do not submit hosted key copies as proof for another origin. Do not bypass origin access restrictions. AI platforms still choose whether to discover, crawl or cite a site. This feature makes compact information available; it cannot guarantee indexing.

No website HTML archive, page-content mirror, passwords or hosting sessions are needed. Do not automatically create billable subscriptions. If keyPrefix uses existing metering, apply the existing explicit billing controls and charge at most once per accepted operation.

## Verification and delivery

Test authentication, unknown/oversized fields, exactly five paths, byte hashes, URL validation, HTML/script injection, cross-publisher isolation, duplicate domain handling, stale/out-of-order revision, identical retry, lost-response retry, concurrent submissions, atomic failure, and no duplicate billing. Verify anonymous visitors can retrieve all five files with matching hashes and the original URL referral. Test existing verified publishing for regressions.

Run a real CiteFleet → BotCentral → public receipt/files round trip on a controlled test record. Delete only marker-owned test data. Report actual commands, results and endpoint URLs. Until this passes, report: built, cross-service E2E pending. Deliver the deployed version, endpoint readiness, any configuration needed in CiteFleet, and contract deviations before changing either side.

## AI application → CiteFleet input

The machine-facing endpoint is on CiteFleet, not BotCentral:
`POST /api/discovery/submissions`, with JSON content type and
`Authorization: Bearer <workspace-submission-key>` created in the campaign UI.
The body is only the compact record below; CiteFleet generates file content,
record identity, hashes and revision itself. Never send a workspace ID, hosting
password, service credential or arbitrary file contents.

```json
{
  "name": "Your website name",
  "url": "https://your-domain.com",
  "summary": "A short factual description of the website.",
  "pages": [{ "url": "https://your-domain.com/about", "title": "About" }],
  "topics": ["Your service"]
}
```

CiteFleet responds with `{siteId, submission}`. Its HTTP 200 means an exact
BotCentral acceptance receipt was validated; HTTP 502 means the record was
saved but delivery was not confirmed. Missing/revoked keys return 401, wrong
content type 415, invalid record 400, oversized body 413, and persistence or
superseded-operation conflicts 409. Clients must inspect status and avoid
presenting a failed or pending delivery as indexed. Revoke or rotate keys through
the authenticated campaign controls.

## CiteFleet verification accompanying this handoff

The CiteFleet implementation was checked on 2026-09-22 in the
`feat/compact-discovery` worktree using Node 24:

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm test`: 736 tests; 728 passed, 8 skipped, 0 failed.
- `npm run build`: exit 0; Nitro generated `.vercel/output/nitro.json`.
- Independent cold review and 16 discovery unit tests passed.
- A headed Chrome run against local CiteFleet HTTP and real local Postgres
  exercised invalid bearer 401, browser key creation, SHA256-only credential
  persistence, valid bearer resolution, persisted failed delivery 502, browser
  submission failure without false acceptance, and revocation followed by 401.
  Marker-owned test rows were removed in FK order.

These local tests deliberately had no BotCentral service configuration. They
prove local handling of failed delivery, not remote acceptance. The successful
cross-service round trip, remote public file retrieval and AI-platform use remain
unverified and must be tested after implementing this endpoint.
