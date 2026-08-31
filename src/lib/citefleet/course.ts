export interface LessonStep {
  title: string;
  body: string;
}

export interface Lesson {
  slug: string;
  number: string;
  title: string;
  summary: string;
  where: string;
  steps: LessonStep[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer: number;
  explain: string;
}

export const LESSONS: Lesson[] = [
  {
    slug: "overview",
    number: "01",
    title: "What CiteFleet is for",
    summary:
      "CiteFleet is an ops console that assigns specialist bots to get a website crawled, submitted, and cited by search engines and AI answer services.",
    where: "Whole app",
    steps: [
      {
        title: "The job",
        body: "A customer origin must become findable (Google, Bing) and listable in AI answers (ChatGPT, Copilot, Perplexity, Gemini, Claude, Grok, Meta AI). Indexing gets you found. Third-party mentions get you cited.",
      },
      {
        title: "Grok Dispatcher",
        body: "This is not an xAI subscription switch. It is the in-app assigner. It pins each playbook task to one specialist bot so no engine door is ownerless.",
      },
      {
        title: "Seeded campaign",
        body: "Resonance (resonanse.app) is preloaded from the Aug 29–30, 2026 campaign: technical doors closed, mentions still open. Use it as the worked example before you onboard another domain.",
      },
    ],
  },
  {
    slug: "command",
    number: "02",
    title: "Command Center",
    summary: "Home is the status board: workspace KPIs, properties, and the answer-engine matrix.",
    where: "Command (nav)",
    steps: [
      {
        title: "Read the four KPIs",
        body: "Workspace is the tenant. Properties is how many origins you run. Bots assigned is how many of the nine agents have an active task. Open tasks is unfinished playbook work.",
      },
      {
        title: "Property card",
        body: "Status WAITING means technical + submission doors are largely done and the campaign is in crawl → index → cite. Scores split Technical / Submissions / Mentions. Mentions will lag until listings and posts exist.",
      },
      {
        title: "Three buttons",
        body: "Live audit fetches the live site. Re-dispatch re-assigns idle bots. Open campaign is the task board for that origin.",
      },
      {
        title: "Answer-engine coverage",
        body: "Each row is one assistant or index: primary source, whether a submit portal exists, and which bot owns the lever. ChatGPT and Copilot ride Bing + IndexNow. Perplexity and Claude have no portal — they need robots.txt plus inbound links. Grok needs live X posts.",
      },
    ],
  },
  {
    slug: "onboard",
    number: "03",
    title: "Onboard a property",
    summary: "Add a customer origin so the dispatcher creates the 11-task playbook and assigns the fleet.",
    where: "Command → Onboard a property",
    steps: [
      {
        title: "Site name",
        body: "Human label only, e.g. Resonance or Acme Dating. It does not have to match the domain.",
      },
      {
        title: "Origin URL",
        body: "Must start with https:// and be the public origin with no trailing path, e.g. https://resonanse.app",
      },
      {
        title: "IndexNow key",
        body: "Optional. Only if the site already hosts a public IndexNow key file. The auditor will GET /{key}.txt to verify it.",
      },
      {
        title: "Assign Grok fleet",
        body: "Creates the property, writes 11 playbook tasks, and assigns each to the specialist bot. You should see Properties increment and a new card appear.",
      },
    ],
  },
  {
    slug: "audit",
    number: "04",
    title: "Live audit",
    summary: "The only automated inspection today: HTTP reality of the origin, mapped onto bot tasks.",
    where: "Property card → Live audit",
    steps: [
      {
        title: "What it fetches",
        body: "Each public route with and without Accept: text/html (SPA fallback / V109 class bugs), robots.txt, sitemap.xml, and the IndexNow key file when present.",
      },
      {
        title: "Crawlers it looks for",
        body: "OAI-SearchBot (ChatGPT), PerplexityBot, Googlebot, Bingbot, ClaudeBot, GPTBot. Missing allow rules become Orion findings.",
      },
      {
        title: "What happens after",
        body: "Findings attach as evidence on Aether / Orion / Helios / Nimbus tasks. Clean technical checks can auto-close those tasks. Mentions and press never auto-close — a human still has to publish.",
      },
    ],
  },
  {
    slug: "campaign",
    number: "05",
    title: "Campaign board",
    summary: "One origin’s punch list. Every task has an owner bot, a checklist, and evidence.",
    where: "Open campaign",
    steps: [
      {
        title: "Priority order",
        body: "P1 is crawl integrity (SPA fallback, robots, sitemap). P2 is submit doors and Grok/X. P3 is directories, press, and app-health. P4 is ongoing monitor.",
      },
      {
        title: "Run bot",
        body: "Technical tasks re-run the live audit. Mention and press tasks advance the next unchecked item. Checkboxes can also be toggled by hand when you finished the work outside the app.",
      },
      {
        title: "Blocked vs done",
        body: "Blocked means the auditor still sees a problem. Done means the checklist is complete. Waiting on the property card means most technical/submit work is done and you are accumulating citations.",
      },
    ],
  },
  {
    slug: "fleet",
    number: "06",
    title: "Grok Fleet",
    summary: "Nine named agents. One lever each. No engine is left without an owner.",
    where: "Grok Fleet (nav)",
    steps: [
      {
        title: "Aether",
        body: "SPA fallback and deep-link HTTP 200s. If crawlers without Accept: text/html get JSON 404s, Google rejects the URL.",
      },
      {
        title: "Orion",
        body: "robots.txt allowlist for AI crawlers and the Sitemap: directive.",
      },
      {
        title: "Helios",
        body: "Sitemap plus Google Search Console. Feeds Gemini and AI Overviews.",
      },
      {
        title: "Nimbus",
        body: "Bing Webmaster Tools plus IndexNow. Feeds ChatGPT search and Copilot, and helps Perplexity.",
      },
      {
        title: "Lyra",
        body: "Sequenced X posts. Grok has no webmaster portal — live posts are the door.",
      },
      {
        title: "Vesper, Cassian, Forge, Sentinel",
        body: "Vesper = directories and review profiles. Cassian = press. Forge = public-page foundation (the trust pages crawlers cite). Sentinel = recrawl and evidence loop.",
      },
    ],
  },
  {
    slug: "playbook",
    number: "07",
    title: "Playbook",
    summary: "The versioned runbook lifted from the Resonance campaign. Tasks are instances of these steps.",
    where: "Playbook (nav)",
    steps: [
      {
        title: "Read before you improvise",
        body: "Each card lists owner callsign, priority, engines, checklist, and an operator hint. Do not skip SPA fallback to jump to Product Hunt — crawlers must see HTML 200s first.",
      },
      {
        title: "Why some engines stay in-progress",
        body: "Perplexity, Claude, and Grok have no submit form. Their playbook rows stay open until links and posts exist in the public web.",
      },
    ],
  },
  {
    slug: "activity",
    number: "08",
    title: "Audit log",
    summary: "Append-only ops trail: who assigned what, which audit ran, which mention shipped.",
    where: "Audit log (nav)",
    steps: [
      {
        title: "How to read a line",
        body: "Timestamp, actor (Grok Dispatcher or a bot name), then the event. Use it when a score moves and you need to know whether that was an audit, a dispatch, or a human checklist tick.",
      },
    ],
  },
  {
    slug: "workflow",
    number: "09",
    title: "Recommended operating sequence",
    summary: "Do the work in this order. Skipping ahead wastes mention effort on a site crawlers still 404.",
    where: "Every property",
    steps: [
      {
        title: "1. Onboard, then Live audit",
        body: "Confirm public routes return 200 without special headers. Fix SPA fallback before anything else.",
      },
      {
        title: "2. robots + sitemap",
        body: "Orion and Helios. AI crawlers allowed. Sitemap lists every public marketing URL.",
      },
      {
        title: "3. Submit doors",
        body: "Helios → Google Search Console. Nimbus → Bing + IndexNow. That covers ChatGPT, Copilot, Gemini, Meta AI.",
      },
      {
        title: "4. Mentions",
        body: "Lyra posts (Grok). Vesper directories. Cassian press. Always include the exact domain so assistants do not cite the wrong “Resonance”.",
      },
      {
        title: "5. Monitor",
        body: "Sentinel. Re-audit after each deploy. Re-dispatch if a check regresses.",
      },
    ],
  },
];

export const QUIZ: QuizQuestion[] = [
  {
    id: "q1",
    prompt: "What does CiteFleet’s “Grok Dispatcher” actually require?",
    choices: [
      "An active SuperGrok subscription and a Grok bot token",
      "Nothing external — it is the in-app assigner that pins tasks to specialist bots",
      "A paid OpenAI key so ChatGPT can be queried",
      "Google Search Console OAuth before the UI will load",
    ],
    answer: 1,
    explain:
      "The fleet runs locally. A Grok/X subscription is only needed later if you wire Lyra to auto-post.",
  },
  {
    id: "q2",
    prompt: "A customer site returns JSON 404 on /premium unless the client sends Accept: text/html. Who owns that?",
    choices: ["Lyra", "Vesper", "Aether", "Cassian"],
    answer: 2,
    explain:
      "Aether owns SPA fallback / crawl integrity. That is the V109-class bug that made Google mark URLs Not found.",
  },
  {
    id: "q3",
    prompt: "How do ChatGPT search and Microsoft Copilot primarily find a new site?",
    choices: [
      "A ChatGPT webmaster form",
      "Brave Search",
      "Live X posts",
      "The Bing index, accelerated by Bing Webmaster Tools and IndexNow",
    ],
    answer: 3,
    explain: "Nimbus owns that door. There is no ChatGPT submit portal.",
  },
  {
    id: "q4",
    prompt: "Perplexity has no submission portal. What is the correct lever?",
    choices: [
      "Only Google Search Console",
      "robots.txt allowing PerplexityBot, plus inbound links and directory/press mentions",
      "IndexNow key file alone",
      "A Perplexity API token in CiteFleet settings",
    ],
    answer: 1,
    explain: "Orion handles crawler access; Lyra / Vesper / Cassian build the link graph Perplexity follows.",
  },
  {
    id: "q5",
    prompt: "Grok (xAI) discovers sites mainly through:",
    choices: [
      "Google Search Console",
      "IndexNow",
      "Live X posts that include the canonical URL",
      "Trustpilot",
    ],
    answer: 2,
    explain: "Lyra’s job. There is no Grok webmaster tool.",
  },
  {
    id: "q6",
    prompt: "Live audit can automatically close which kind of task?",
    choices: [
      "Press pitches and Product Hunt launches",
      "Technical doors it can prove over HTTP (SPA fallback, robots, sitemap, IndexNow key)",
      "Any task with a checkbox",
      "Grok mention drafts",
    ],
    answer: 1,
    explain: "Mentions require a human to publish. The auditor only proves fetchable surfaces.",
  },
  {
    id: "q7",
    prompt: "Correct first move on a brand-new property?",
    choices: [
      "Product Hunt launch",
      "Press pitch to Mashable",
      "Onboard + Live audit, then fix crawl 404s before listings",
      "Buy backlinks",
    ],
    answer: 2,
    explain: "Crawlers must see HTML 200s. Listings on a 404 origin waste the mention spike.",
  },
  {
    id: "q8",
    prompt: "Where do you tick work you already did outside the app (claimed Trustpilot, posted draft #2)?",
    choices: [
      "Only in Audit log by typing a note",
      "Command KPI cards",
      "Open campaign — toggle the checklist or press Run bot on that task",
      "Playbook page, which writes back to production",
    ],
    answer: 2,
    explain: "Playbook is the read-only runbook. The campaign board is the live checklist.",
  },
  {
    id: "q9",
    prompt: "Gemini / AI Overviews are fed by:",
    choices: [
      "Bing only",
      "The Google index via Search Console (Helios)",
      "X posts only",
      "Brave Search",
    ],
    answer: 1,
    explain: "Helios owns GSC, sitemap submit, and URL Inspection.",
  },
  {
    id: "q10",
    prompt: "Why must mentions include the exact domain (resonanse.app), not just the word “Resonance”?",
    choices: [
      "IndexNow keys are domain-scoped",
      "Other products share the name; assistants will cite the wrong property without the URL",
      "Google forbids brand-only anchors",
      "CiteFleet rejects tasks without a hyphen",
    ],
    answer: 1,
    explain:
      "Name collision is already visible in search. The domain is the disambiguator every bot should carry.",
  },
];

export const PASS_SCORE = 8;
