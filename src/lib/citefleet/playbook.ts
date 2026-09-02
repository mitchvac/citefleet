import type { EngineCoverage, PlaybookId, Site, Task } from "./types";

export type ChecklistSpec = string | { label: string; href: string };

export interface PlaybookStep {
  id: PlaybookId;
  title: string;
  description: string;
  botCallsign: string;
  priority: 1 | 2 | 3 | 4 | 5;
  engines: EngineCoverage["engine"][];
  checklist: ChecklistSpec[];
  operatorHint: string;
}

export function specLabel(spec: ChecklistSpec) {
  return typeof spec === "string" ? spec : spec.label;
}

export function resolveDoorHref(href: string, site?: Pick<Site, "domain" | "url">) {
  const origin = (site?.url || "").replace(/\/$/, "");
  const domain = site?.domain || "";
  return href.replaceAll("{domain}", domain).replaceAll("{origin}", origin);
}

export const ENGINE_MATRIX: EngineCoverage[] = [
  {
    engine: "chatgpt",
    label: "ChatGPT (search)",
    primarySource: "Bing index + OAI-SearchBot",
    submissionDoor: "Bing Webmaster Tools + IndexNow",
    lever: "Nimbus bot — Bing + IndexNow ping",
    status: "covered",
  },
  {
    engine: "copilot",
    label: "Microsoft Copilot",
    primarySource: "Bing index",
    submissionDoor: "Bing Webmaster Tools + IndexNow",
    lever: "Nimbus bot — same Bing door as ChatGPT",
    status: "covered",
  },
  {
    engine: "perplexity",
    label: "Perplexity",
    primarySource: "Own crawler + Bing",
    submissionDoor: "None — discovery via links",
    lever: "Orion robots.txt + Lyra/Vesper/Cassian inbound links",
    status: "in-progress",
  },
  {
    engine: "gemini",
    label: "Gemini / AI Overviews",
    primarySource: "Google index",
    submissionDoor: "Google Search Console",
    lever: "Helios bot — GSC property, sitemap, URL inspection",
    status: "covered",
  },
  {
    engine: "claude",
    label: "Claude",
    primarySource: "Brave Search",
    submissionDoor: "None — discovery via links",
    lever: "Orion robots.txt + mention campaign",
    status: "in-progress",
  },
  {
    engine: "grok",
    label: "Grok (xAI)",
    primarySource: "Live X search + real-time posts",
    submissionDoor: "None — X activity",
    lever: "Lyra bot — sequenced posts from live accounts",
    status: "in-progress",
  },
  {
    engine: "meta-ai",
    label: "Meta AI",
    primarySource: "Google + Bing",
    submissionDoor: "None",
    lever: "Covered by Helios + Nimbus",
    status: "covered",
  },
  {
    engine: "google",
    label: "Google Search",
    primarySource: "Googlebot crawl + GSC",
    submissionDoor: "Search Console",
    lever: "Helios + Aether (no SPA 404s)",
    status: "covered",
  },
  {
    engine: "bing",
    label: "Bing Search",
    primarySource: "Bingbot + IndexNow",
    submissionDoor: "Webmaster Tools + IndexNow",
    lever: "Nimbus bot",
    status: "covered",
  },
  {
    engine: "indexnow",
    label: "IndexNow network",
    primarySource: "api.indexnow.org",
    submissionDoor: "Key file + POST ping",
    lever: "Nimbus bot on every deploy",
    status: "covered",
  },
];

export const PLAYBOOK: PlaybookStep[] = [
  {
    id: "spa_fallback",
    title: "Repair SPA fallback 404s",
    description:
      "Serve the app shell for any GET/HEAD that is not /api/* or a real static file. Crawlers that omit Accept: text/html must still receive HTTP 200 HTML, not JSON 404.",
    botCallsign: "AETHER",
    priority: 1,
    engines: ["google", "bing", "gemini", "chatgpt"],
    checklist: [
      { label: "Reproduce live fetch without Accept: text/html", href: "{origin}/premium" },
      { label: "Confirm deep routes return 200 HTML", href: "{origin}/guidelines" },
      "Deploy SPA fallback and re-verify 8+ public routes",
      {
        label: "Request Google URL Inspection recrawl",
        href: "https://search.google.com/search-console",
      },
    ],
    operatorHint:
      "The SPA-fallback class of bug: routes answer JSON 404 to crawlers that omit Accept: text/html, so Google marks them Not found (404). Fix this before any listing.",
  },
  {
    id: "robots_ai",
    title: "Welcome AI crawlers in robots.txt",
    description:
      "Explicitly allow Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, and declare the sitemap. No submission portal exists for OpenAI, Brave, or Perplexity — they follow links.",
    botCallsign: "ORION",
    priority: 1,
    engines: ["chatgpt", "perplexity", "claude", "google", "bing"],
    checklist: [
      { label: "robots.txt reachable at origin", href: "{origin}/robots.txt" },
      "OAI-SearchBot allowed",
      "PerplexityBot allowed",
      "Googlebot / Bingbot allowed",
      { label: "Sitemap declared", href: "{origin}/sitemap.xml" },
    ],
    operatorHint: "Crawler access is table-stakes before mention campaigns matter.",
  },
  {
    id: "sitemap",
    title: "Publish and submit sitemap.xml",
    description:
      "Generate a complete public-route sitemap and submit it to Google Search Console and Bing Webmaster Tools.",
    botCallsign: "HELIOS",
    priority: 1,
    engines: ["google", "bing", "gemini", "chatgpt", "copilot"],
    checklist: [
      { label: "sitemap.xml returns 200", href: "{origin}/sitemap.xml" },
      "All public marketing routes listed",
      { label: "Submitted in GSC", href: "https://search.google.com/search-console" },
      {
        label: "Submitted in Bing Webmaster Tools",
        href: "https://www.bing.com/webmasters",
      },
    ],
    operatorHint: "List every public marketing URL: home, product/pricing pages, and the legal and trust pages (privacy, terms, guidelines, safety).",
  },
  {
    id: "gsc_submit",
    title: "Google Search Console campaign",
    description:
      "Verify domain property, submit sitemap, request indexing on new/changed URLs. Feeds Gemini and AI Overviews.",
    botCallsign: "HELIOS",
    priority: 2,
    engines: ["google", "gemini", "meta-ai"],
    checklist: [
      { label: "Domain property verified", href: "https://search.google.com/search-console" },
      { label: "Homepage confirmed indexed", href: "https://search.google.com/search-console" },
      { label: "Priority URLs in crawl queue", href: "https://search.google.com/search-console" },
      {
        label: "URL Inspection live test successful",
        href: "https://search.google.com/search-console",
      },
    ],
    operatorHint: "New URLs often sit in 'Crawled – currently not indexed' for days–weeks.",
  },
  {
    id: "bing_webmaster",
    title: "Bing Webmaster Tools campaign",
    description:
      "Import or verify the site, submit sitemap. Feeds ChatGPT search and Copilot, and partially Perplexity.",
    botCallsign: "NIMBUS",
    priority: 2,
    engines: ["bing", "chatgpt", "copilot", "perplexity", "meta-ai"],
    checklist: [
      { label: "Webmaster Tools property active", href: "https://www.bing.com/webmasters" },
      {
        label: "Sitemap status Success, 0 errors",
        href: "https://www.bing.com/webmasters/sitemaps",
      },
      { label: "AI Performance (BETA) report bookmarked", href: "https://www.bing.com/webmasters" },
    ],
    operatorHint: "Bing can be imported from GSC via OAuth to save a verification cycle.",
  },
  {
    id: "indexnow",
    title: "IndexNow instant-push",
    description:
      "Host the key file at origin and POST changed URLs to api.indexnow.org so Bing, Yandex, Naver, Seznam, and Yep recrawl on deploy.",
    botCallsign: "NIMBUS",
    priority: 2,
    engines: ["indexnow", "bing", "chatgpt", "copilot"],
    checklist: [
      { label: "Key file live at /{key}.txt", href: "https://www.indexnow.org/documentation" },
      { label: "POST all sitemap URLs → HTTP 202/200 Accepted", href: "https://www.indexnow.org/" },
      "Ping hooked to deploy pipeline (non-fatal)",
    ],
    operatorHint: "IndexNow keys are public verification keys by design — not secrets.",
  },
  {
    id: "app_health",
    title: "Public-page foundation health",
    description:
      "Repair the production data and feature surface that public trust pages depend on (guidelines, consent, safety, notifications).",
    botCallsign: "FORGE",
    priority: 3,
    engines: ["google", "gemini", "claude"],
    checklist: [
      { label: "Required tables/collections exist", href: "{origin}/guidelines" },
      { label: "Public routes render without server errors", href: "{origin}" },
      { label: "Trust features backing press claims are live", href: "{origin}/guidelines" },
    ],
    operatorHint:
      "Public trust pages often depend on production data that was never created. Verify the backing tables and features exist before pitching the story.",
  },
  {
    id: "x_mentions",
    title: "Grok / X live mention sequence",
    description:
      "Ship staggered posts from live accounts. Grok's primary source is live X search — there is no webmaster portal.",
    botCallsign: "LYRA",
    priority: 2,
    engines: ["grok"],
    checklist: [
      { label: "Draft #1 live from at least one account", href: "https://x.com/compose/post" },
      {
        label: "Drafts #2 and #3 scheduled 1–2 days apart",
        href: "https://x.com/compose/post",
      },
      { label: "Canonical URL present in each post", href: "{origin}" },
    ],
    operatorHint: "Vary wording per account. First mentions can surface in Grok within days.",
  },
  {
    id: "directories",
    title: "Directory and review listings",
    description:
      "Claim Trustpilot, SmartCustomer, Product Hunt, AlternativeTo, and SaaSHub so answer engines have third-party pages to cite.",
    botCallsign: "VESPER",
    priority: 3,
    engines: ["chatgpt", "perplexity", "claude", "gemini", "grok"],
    checklist: [
      { label: "Trustpilot business claimed", href: "https://business.trustpilot.com/" },
      { label: "SmartCustomer registered", href: "https://www.smartcustomer.com/business" },
      {
        label: "Product Hunt launch queued (Tue–Thu AM)",
        href: "https://www.producthunt.com/posts/new",
      },
      {
        label: "AlternativeTo listing vs category incumbents",
        href: "https://alternativeto.net/manage/new/",
      },
      { label: "SaaSHub submitted", href: "https://www.saashub.com/submit" },
    ],
    operatorHint: "Indexing gets you findable; third-party mentions get you listed in answers.",
  },
  {
    id: "botcentral_list",
    title: "List on BotCentral (bot search catalog)",
    description:
      "Publish a BotCentral 1.0 card so GPTBot, PerplexityBot, Bingbot, and Google-Extended can find the site via botcentral.org/v1/search. CiteFleet is the only publisher; bots never submit.",
    botCallsign: "ORION",
    priority: 2,
    engines: ["chatgpt", "perplexity", "claude", "gemini", "grok"],
    checklist: [
      { label: "Origin robots.txt and sitemap reachable", href: "{origin}/robots.txt" },
      { label: "Card published to BotCentral", href: "https://botcentral.org/site/{domain}" },
      { label: "GET /v1/site/{domain} returns 200", href: "https://botcentral.org/v1/site/{domain}" },
      {
        label: "Search hit appears for a topic keyword",
        href: "https://botcentral.org/v1/search?q=dating",
      },
    ],
    operatorHint:
      "This is the bot-search listing door. Mentions (Lyra/Vesper/Cassian) are a separate layer.",
  },
  {
    id: "press",
    title: "Press and high-authority citations",
    description:
      "Pitch vertical press so every AI system has a high-authority page to quote.",
    botCallsign: "CASSIAN",
    priority: 3,
    engines: ["chatgpt", "claude", "gemini", "perplexity", "grok", "meta-ai"],
    checklist: [
      { label: "Press kit packaged", href: "{origin}/llms.txt" },
      { label: "Vertical outlets pitched", href: "https://www.datingnews.com/" },
      {
        label: "At least one referring domain confirmed",
        href: "https://search.google.com/search-console",
      },
    ],
    operatorHint:
      "Target the vertical press for the customer's category first (industry news and analyst sites), then one mainstream outlet.",
  },
  {
    id: "monitor",
    title: "Crawl → index → cite monitor",
    description:
      "Watch GSC, Bing, live HTTP, and inbound mentions. Re-dispatch bots when a check regresses.",
    botCallsign: "SENTINEL",
    priority: 4,
    engines: ["google", "bing", "grok", "chatgpt"],
    checklist: [
      {
        label: "Weekly GSC + Bing AI Performance review",
        href: "https://search.google.com/search-console",
      },
      { label: "External HTTP 200 sweep on public routes", href: "{origin}" },
      {
        label: "Inbound link / mention log updated",
        href: "https://search.google.com/search-console",
      },
    ],
    operatorHint: "After technical doors close, the campaign is a waiting phase driven by inbound links.",
  },
];

export function playbookToTaskDraft(
  siteId: string,
  step: PlaybookStep,
): Omit<Task, "id" | "updatedAt"> {
  return {
    siteId,
    playbookId: step.id,
    title: step.title,
    description: step.description,
    status: "queued",
    priority: step.priority,
    checklist: step.checklist.map((spec, i) => ({
      id: `${step.id}-${i + 1}`,
      label: specLabel(spec),
      href: typeof spec === "string" ? undefined : spec.href,
      done: false,
    })),
    evidence: [],
  };
}

export function applyPlaybookHrefs(tasks: Task[], sites: Site[]) {
  for (const task of tasks) {
    const site = sites.find((s) => s.id === task.siteId);
    const step = PLAYBOOK.find((p) => p.id === task.playbookId);
    if (!step) continue;
    for (let i = 0; i < task.checklist.length; i++) {
      const item = task.checklist[i];
      const spec =
        step.checklist.find((s) => specLabel(s) === item.label) ?? step.checklist[i];
      if (!spec || typeof spec === "string" || !spec.href) continue;
      item.href = resolveDoorHref(spec.href, site);
    }
  }
}
