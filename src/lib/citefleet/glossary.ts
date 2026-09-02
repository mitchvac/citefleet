export interface Term {
  id: string;
  term: string;
  standsFor?: string;
  meaning: string;
}

export const GLOSSARY: Term[] = [
  {
    id: "origin",
    term: "Origin / property",
    meaning:
      "The public website you are trying to get indexed, e.g. https://acme-dating.com. A property is that origin inside CiteFleet.",
  },
  {
    id: "dispatcher",
    term: "Grok Dispatcher",
    meaning:
      "The in-app assigner. It creates playbook tasks and pins each one to a specialist bot. Not an xAI subscription and not a ChatGPT plugin.",
  },
  {
    id: "bot",
    term: "Bot / callsign",
    meaning:
      "A named agent with one job (Aether, Helios, Nimbus…). The callsign is the short name on badges (AETHER).",
  },
  {
    id: "playbook",
    term: "Playbook",
    meaning:
      "The fixed runbook of jobs every property follows. Campaign tasks are live instances of playbook steps. Includes the BotCentral listing door.",
  },
  {
    id: "spa",
    term: "SPA",
    standsFor: "Single-Page Application",
    meaning:
      "A site that serves one HTML shell and routes in JavaScript. Crawlers that do not send Accept: text/html may get a JSON 404 unless a fallback serves HTML for every public URL.",
  },
  {
    id: "v109",
    term: "SPA fallback",
    meaning:
      "The single-page-app bug where real routes return JSON 404 to crawlers that omit Accept: text/html. Aether owns this check.",
  },
  {
    id: "accept",
    term: "Accept header",
    meaning:
      "An HTTP header saying what format the client wants. Googlebot and many preview crawlers often omit Accept: text/html. The auditor fetches both ways.",
  },
  {
    id: "robots",
    term: "robots.txt",
    meaning:
      "File at /robots.txt that tells crawlers what they may fetch. Must allow AI bots and declare the sitemap.",
  },
  {
    id: "sitemap",
    term: "sitemap.xml",
    meaning:
      "List of public URLs you want indexed. Helios submits it to Google; Nimbus submits it to Bing.",
  },
  {
    id: "gsc",
    term: "GSC",
    standsFor: "Google Search Console",
    meaning:
      "Google’s webmaster door. Verify the domain, submit the sitemap, request indexing. Feeds Gemini and AI Overviews.",
  },
  {
    id: "url-inspect",
    term: "URL Inspection",
    meaning:
      "GSC tool that fetches one URL as Googlebot. Used to confirm a 404 is gone after an SPA fallback fix.",
  },
  {
    id: "aio",
    term: "AI Overviews",
    meaning:
      "Google’s AI answer boxes on search results. They read the Google index, so GSC + crawlable HTML matter.",
  },
  {
    id: "indexnow",
    term: "IndexNow",
    meaning:
      "A ping protocol. You host a public key file and POST changed URLs to api.indexnow.org so Bing (and Yandex, Naver, Seznam, Yep) recrawl quickly.",
  },
  {
    id: "bwt",
    term: "Bing Webmaster Tools",
    meaning:
      "Bing’s webmaster door. Feeds ChatGPT search and Copilot. Can be imported from GSC via OAuth.",
  },
  {
    id: "oai",
    term: "OAI-SearchBot",
    standsFor: "OpenAI Search Bot",
    meaning:
      "ChatGPT’s search crawler. Allow it in robots.txt. Discovery still depends on Bing plus public links.",
  },
  {
    id: "gptbot",
    term: "GPTBot",
    meaning:
      "OpenAI crawler used more for training/collection than for the live ChatGPT search box. Still allow it unless you have a reason not to.",
  },
  {
    id: "pplx",
    term: "PerplexityBot",
    meaning:
      "Perplexity’s crawler. No submit form. Allow in robots.txt and earn inbound links.",
  },
  {
    id: "claudebot",
    term: "ClaudeBot",
    meaning:
      "Anthropic crawler. Claude answers also lean on Brave Search. No webmaster portal — links matter.",
  },
  {
    id: "googlebot",
    term: "Googlebot / Bingbot",
    meaning:
      "Official Google and Bing crawlers. If they cannot fetch HTML 200s, nothing downstream (Gemini, ChatGPT-via-Bing) works.",
  },
  {
    id: "cite",
    term: "Cite vs index",
    meaning:
      "Indexed = the URL exists in Google/Bing. Cited = an AI answer names or links you. Mentions and press drive citations.",
  },
  {
    id: "kpi",
    term: "KPI",
    standsFor: "Key Performance Indicator",
    meaning:
      "The four Command tiles: workspace, properties, bots assigned, open tasks.",
  },
  {
    id: "llms",
    term: "llms.txt",
    meaning:
      "Optional public file that explains the product in plain text for AI assistants. Helpful, not a substitute for GSC/Bing.",
  },

  {
    id: "botcentral",
    term: "BotCentral",
    meaning:
      "The public catalog at botcentral.org. Assistants read GET /v1/search and GET /v1/site/{domain}. CiteFleet is the only publisher. The Card Inspector is the human page; the machine card is the JSON bots fetch.",
  },
  {
    id: "machine-card",
    term: "Machine card",
    meaning:
      "The BotCentral 1.0 JSON at /v1/site/{domain}. Not a website. Use the inspector at /site/{domain} to read it as a page.",
  },
  {
    id: "kill",
    term: "Kill switch",
    meaning:
      "Freezes acts (publish, mentions, spend, autopilot) without stopping observe (audit, monitor, reconcile). Global or per door. Open Monitor to freeze or thaw.",
  },
  {
    id: "reconcile",
    term: "Reconcile / drift",
    meaning:
      "A check that origin, sitemap, BotCentral card, and campaign ticks still agree. Drift means they do not. A tick without a proof URL is invalid.",
  },
  {
    id: "origin-pack",
    term: "Origin pack",
    meaning:
      "The files CiteFleet writes into a customer GitHub repo: public/robots.txt, public/sitemap.xml, public/llms.txt, public/.well-known/botcentral.txt, and the IndexNow key file. They only go live after that repo is deployed to the customer domain. CiteFleet does not host them.",
  },
  {
    id: "proof",
    term: "Origin proof",
    standsFor: "botcentral-verify=citefleet-app",
    meaning:
      "How BotCentral knows the origin opted in: that line served as plain text at /.well-known/botcentral.txt, or the same line in an apex DNS TXT record. CiteFleet checks it with the registry's own rules before publishing (Verify proof) so a missing proof is reported with the exact line to add.",
  },
  {
    id: "webhook",
    term: "Webhook / deploy hook",
    meaning:
      "Automatic listing. A repository webhook (GitHub) or a signed POST from any CI (deploy hook) tells CiteFleet a deploy happened; CiteFleet re-checks the proof for a few minutes and then lists or refreshes the card. Each property has its own secret, shown once when generated.",
  },
  {
    id: "operator",
    term: "Operator token",
    meaning:
      "The one shared sign-in for this console, set as CITEFLEET_OPERATOR_TOKEN on the server and exchanged at /login for a session cookie. Every action and the workspace data are behind it; customer hooks and /health are not.",
  },
];
