import type { Site } from "./types";
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

export function buildOriginPack(site: Site): OriginFile[] {
  const origin = site.url.replace(/\/$/, "");
  const root = originRoot(site);
  const prefix = root ? `${root}/` : "";
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
    `Sitemap: ${origin}/sitemap.xml`,
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
    { path: `${prefix}robots.txt`, content: robots },
    { path: `${prefix}sitemap.xml`, content: sitemap },
    { path: `${prefix}llms.txt`, content: llms },
    { path: `${prefix}.well-known/botcentral.txt`, content: wellKnown },
  ];

  if (site.indexNowKey) {
    files.push({
      path: `${prefix}${site.indexNowKey}.txt`,
      content: `${site.indexNowKey}\n`,
    });
  }

  return files;
}
