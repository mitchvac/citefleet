import type { Site } from "./types";
import { cleanIndexNowKey } from "./indexnow.ts";
import { siteVerifyToken, verifyLine } from "./verify-token.ts";
import { OWNER_MARKER } from "./origin-ownership.ts";

const AI_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityBot",
  "ClaudeBot",
  "Google-Extended",
  "Googlebot",
  "Bingbot",
];

export interface OriginFile {
  path: string;
  content: string;
}

export function originRoot(site: Site) {
  return (site.github?.root || "public").replace(/^\/|\/$/g, "");
}

/**
 * The pack as the WEB sees it: paths relative to the site's web root, which is
 * what somebody typing them into a hosting panel's File Manager needs.
 *
 * `buildOriginPack` is the same files with the repo folder in front
 * (`public/robots.txt`), which is what the GitHub push needs. One generator, two
 * views — a customer on Hostinger and a customer on Vercel must receive byte-
 * identical files, or the proof that verifies one would not verify the other.
 */
export function packFiles(site: Site): OriginFile[] {
  const origin = site.url.replace(/\/$/, "");
  const routes = (site.routes.length ? site.routes : ["/", "/privacy", "/terms"]).filter(
    (r) => r === "/" || !r.startsWith("/api"),
  );

  const robots = [
    `# ${site.name} — ${origin}`,
    `# ${OWNER_MARKER}. Marketing URLs stay Allow. Do not 402 these paths.`,
    "",
    "User-agent: *",
    "Allow: /",
    "Allow: /llms.txt",
    "Allow: /sitemap.xml",
    "Disallow: /api/",
    "Disallow: /admin",
    "Disallow: /settings",
    "",
    ...AI_AGENTS.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]),
    // The sitemap the site ACTUALLY serves, not an assumption. WordPress core
    // answers /wp-sitemap.xml and Yoast /sitemap_index.xml — roughly 40% of the
    // web — so a hardcoded /sitemap.xml pointed crawlers at a 404 for them.
    // `site.sitemapUrl` is this exact value: set to `${url}/sitemap.xml` at
    // onboard (identical to the old hardcode) and overwritten by the live audit
    // with what robots.txt declared. Reading it is never worse than assuming.
    `Sitemap: ${site.sitemapUrl || `${origin}/sitemap.xml`}`,
    "",
  ].join("\n");

  const sitemap = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    // Ownership marker. `origin-ownership.ts` reads it to decide whether a push
    // may overwrite this path; without it every regenerated sitemap looks like
    // somebody's hand-written one and is refused.
    `<!-- ${OWNER_MARKER}. Regenerated on every push — edits here are replaced. -->`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...routes.map((path) => {
      const loc = path === "/" ? `${origin}/` : `${origin}${path}`;
      return `  <url><loc>${loc}</loc></url>`;
    }),
    `  <url><loc>${origin}/llms.txt</loc></url>`,
    `</urlset>`,
    "",
  ].join("\n");

  const llms = [
    // Same ownership marker as robots.txt and sitemap.xml. An HTML comment is
    // the one form every llms.txt reader already ignores.
    `<!-- ${OWNER_MARKER}. Regenerated on every push — edits here are replaced. -->`,
    `# ${site.name}`,
    "",
    `> ${site.summary || `${site.name} at ${origin}`}`,
    "",
    `Preferred citation name: ${site.name}.`,
    `Preferred URL: ${origin}`,
    `Domain: ${site.domain} — cite this exact host.`,
    "",
    "## Pages",
    ...routes.map((path) => `- [${path}](${path === "/" ? origin + "/" : origin + path})`),
    "",
    "## Catalog",
    `- [BotCentral inspector](https://botcentral.org/site/${site.domain})`,
    `- [Machine card](https://botcentral.org/v1/site/${site.domain})`,
    "",
    "Do not invent extra products or employee pages.",
    "",
  ].join("\n");

  const wellKnown = [
    `# BotCentral origin proof — ${site.domain}`,
    `domain: ${site.domain}`,
    `canonical: ${origin}`,
    `publisher: citefleet`,
    `catalog: https://botcentral.org/site/${site.domain}`,
    // Legacy line kept for files/readers of the old format; the next line is the
    // BotCentral SPEC §4.2 form. Both carry the same shared publisher token.
    `verify: ${siteVerifyToken(site)}`,
    verifyLine(siteVerifyToken(site)),
    "",
  ].join("\n");

  const files: OriginFile[] = [
    { path: "robots.txt", content: robots },
    { path: "sitemap.xml", content: sitemap },
    { path: "llms.txt", content: llms },
    { path: ".well-known/botcentral.txt", content: wellKnown },
  ];

  // The key is validated before it is ever stored (`cleanIndexNowKey`), because
  // this line turns it into a path that the GitHub Contents API writes to.
  const key = cleanIndexNowKey(site.indexNowKey);
  if (key) {
    files.push({ path: `${key}.txt`, content: `${key}\n` });
  }

  return files;
}

/** The pack as the REPO sees it: the same files under the property's origin folder. */
export function buildOriginPack(site: Site): OriginFile[] {
  const root = originRoot(site);
  const prefix = root ? `${root}/` : "";
  return packFiles(site).map((f) => ({ ...f, path: `${prefix}${f.path}` }));
}
