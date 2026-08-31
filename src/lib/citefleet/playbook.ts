import type { EngineCoverage, PlaybookId, Task } from "./types";

export interface PlaybookStep {
  id: PlaybookId;
  title: string;
  description: string;
  botCallsign: string;
  priority: 1 | 2 | 3 | 4 | 5;
  engines: EngineCoverage["engine"][];
  checklist: string[];
  operatorHint: string;
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
      "Reproduce live fetch without Accept: text/html",
      "Confirm deep routes return 200 HTML",
      "Deploy SPA fallback and re-verify 8+ public routes",
      "Request Google URL Inspection recrawl",
    ],
    operatorHint:
      "This was the V109 critical bug on resonanse.app — Google rejected /premium and /guidelines as Not found (404).",
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
      "robots.txt reachable at origin",
      "OAI-SearchBot allowed",
      "PerplexityBot allowed",
      "Googlebot / Bingbot allowed",
      "Sitemap declared",
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
      "sitemap.xml returns 200",
      "All public marketing routes listed",
      "Submitted in GSC",
      "Submitted in Bing Webmaster Tools",
    ],
    operatorHint: "Resonance sitemap: 8 URLs — / /premium /privacy /terms /cookies /guidelines /report /data",
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
      "Domain property verified",
      "Homepage confirmed indexed",
      "Priority URLs in crawl queue",
      "URL Inspection live test successful",
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
      "Webmaster Tools property active",
      "Sitemap status Success, 0 errors",
      "AI Performance (BETA) report bookmarked",
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
      "Key file live at /{key}.txt",
      "POST all sitemap URLs → HTTP 202/200 Accepted",
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
      "Required tables/collections exist",
      "Public routes render without server errors",
      "Trust features backing press claims are live",
    ],
    operatorHint:
      "Resonance required 6 missing Supabase tables before SafeDate and guidelines could back the public story.",
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
      "Draft #1 live from at least one account",
      "Drafts #2 and #3 scheduled 1–2 days apart",
      "Canonical URL present in each post",
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
      "Trustpilot business claimed",
      "SmartCustomer registered",
      "Product Hunt launch queued (Tue–Thu AM)",
      "AlternativeTo listing vs category incumbents",
      "SaaSHub submitted",
    ],
    operatorHint: "Indexing gets you findable; third-party mentions get you listed in answers.",
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
      "Press kit packaged",
      "Vertical outlets pitched",
      "At least one referring domain confirmed",
    ],
    operatorHint:
      "Resonance targets: DatingNews, Global Dating Insights, Courtland Brooks, Healthy Framework, Mashable.",
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
      "Weekly GSC + Bing AI Performance review",
      "External HTTP 200 sweep on public routes",
      "Inbound link / mention log updated",
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
    checklist: step.checklist.map((label, i) => ({
      id: `${step.id}-${i + 1}`,
      label,
      done: false,
    })),
    evidence: [],
  };
}
