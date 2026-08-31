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
      "The public website you are trying to get indexed, e.g. https://resonanse.app. A property is that origin inside CiteFleet.",
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
      "The fixed runbook of 11 jobs copied from the Resonance campaign. Campaign tasks are live instances of playbook steps.",
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
    term: "V109 / SPA fallback",
    meaning:
      "The Resonance bug: /premium and /guidelines returned JSON 404 without Accept: text/html. Aether owns this check.",
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
];
