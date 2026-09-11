// Browser-safe. The ONE set of predicates deciding whether an origin-pack file
// is actually serving — shared by the auditor and the monitor so the two cannot
// disagree about the same file again.
//
// They already did. `monitor.ts` tested llms.txt with `text.trim().startsWith("#")`
// while `originPack.ts` emits `<!-- Written by CiteFleet… -->` as line 1, so
// CiteFleet's own generated file scored false against CiteFleet's own check.
// Nothing caught it because `reconcile.ts` never read the value.
//
// THE RULE EVERY CHECK HERE APPLIES: a 200 is not a file. Azure Static Web Apps'
// `navigationFallback` and DigitalOcean App Platform's `catchall_document` both
// answer 200 with `/index.html` for a path that does not exist, so a status-code
// check reports success while BotCentral rejects the HTML. Google Cloud Storage
// defaults unset objects to `application/octet-stream`, which is a download
// rather than plain text and fails BotCentral's rule the same way.
// `docs/providers/README.md` names both and says plainly that `proof.ts` guards
// this and "the audit should too". This module is that guard, made shareable.

export interface FetchedFile {
  /** `null` when the request never completed — a DNS failure, a timeout, a reset. */
  status: number | null;
  text: string;
  contentType: string;
}

export interface FileVerdict {
  ok: boolean;
  /** Why, in the words the customer needs. Empty when ok. */
  reason: string;
}

const ok: FileVerdict = { ok: true, reason: "" };
const bad = (reason: string): FileVerdict => ({ ok: false, reason });

/** The first 400 bytes are enough to recognise a page pretending to be a file. */
export function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  return (
    head.includes("<!doctype") ||
    head.includes("<html") ||
    head.includes("<head") ||
    head.includes("<body")
  );
}

/**
 * Either signal disqualifies a 200 — the body sniff OR the declared type.
 * A platform that serves an app shell usually declares text/html and a platform
 * that serves a 404 page sometimes does not, so neither test alone is enough.
 */
export function isHtmlish(file: Pick<FetchedFile, "text" | "contentType">): boolean {
  return looksLikeHtml(file.text) || file.contentType.toLowerCase().includes("text/html");
}

/** Shared preamble: it answered, it is not a page, it is not empty. */
function servesPlainText(file: FetchedFile, what: string): FileVerdict {
  // A request that never completed is not a 404 and must not read as one — the
  // customer's file may be fine and their DNS or our network may not be.
  if (file.status === null) return bad(`${what} could not be reached.`);
  if (file.status !== 200) return bad(`${what} returned ${file.status}.`);
  if (isHtmlish(file)) {
    return bad(
      `${what} returned HTML, not a file. A page that renders for every path ` +
        `(an SPA shell, or a 404 page served with status 200) does not count.`,
    );
  }
  if (!file.text.trim()) return bad(`${what} is empty.`);
  return ok;
}

export function checkRobots(file: FetchedFile): FileVerdict {
  return servesPlainText(file, "robots.txt");
}

export function checkSitemapDoc(file: FetchedFile): FileVerdict {
  const base = servesPlainText(file, "The sitemap");
  if (!base.ok) return base;
  if (!/<urlset|<sitemapindex/i.test(file.text)) {
    return bad("The sitemap is not XML — no <urlset> or <sitemapindex> element.");
  }
  if (!/<loc>/i.test(file.text)) return bad("The sitemap lists no URLs.");
  return ok;
}

export function checkLlms(file: FetchedFile): FileVerdict {
  const base = servesPlainText(file, "llms.txt");
  if (!base.ok) return base;
  // A heading ANYWHERE, not `startsWith`. CiteFleet's own generated file opens
  // with an HTML ownership comment, so the old `startsWith("#")` rejected it.
  if (!/^#\s/m.test(file.text)) {
    return bad("llms.txt has no markdown heading — it should start a line with `# `.");
  }
  return ok;
}

export function checkWellKnownFile(file: FetchedFile, token: string): FileVerdict {
  const base = servesPlainText(file, "/.well-known/botcentral.txt");
  if (!base.ok) return base;
  // Look for the PROOF TOKEN, not merely a `domain:` line. The monitor's old
  // predicate matched any file with `domain: something` in it — including one
  // written by somebody else entirely.
  if (!tokenPresent(file.text, token)) {
    return bad(`/.well-known/botcentral.txt does not contain botcentral-verify=${token}.`);
  }
  return ok;
}

export function checkIndexNowKeyFile(file: FetchedFile, key: string): FileVerdict {
  const base = servesPlainText(file, `/${key}.txt`);
  if (!base.ok) return base;
  // IndexNow requires the file to contain the key and NOTHING else. `includes`
  // would pass on an HTML page that happens to mention it.
  if (file.text.trim() !== key) {
    return bad(`/${key}.txt must contain exactly the key and nothing else.`);
  }
  return ok;
}

export function tokenPresent(haystack: string, token: string): boolean {
  if (!token) return false;
  return haystack.includes(`botcentral-verify=${token}`) || haystack.includes(token);
}
