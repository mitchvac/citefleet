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
        title: "Every customer is just an origin URL",
        body: "A fresh workspace has no properties. You onboard each customer by its public origin (e.g. https://acme-dating.com); CiteFleet then runs the same playbook for every site. Nothing about a customer lives in the code.",
      },
    ],
  },
  {
    slug: "list-a-site",
    number: "02",
    title: "Get a website listed (step by step)",
    summary:
      "The full CiteFleet path: onboard an origin, prove it crawls, list it on BotCentral, submit Google/Bing, then earn citations. Do not skip ahead.",
    where: "Command → campaign → BotCentral",
    steps: [
      {
        title: "1. Open Command",
        body: "Sign in at /login with Google, X, or email if you are not already (the console is gated; customer hooks and /health are not). Then in the top nav click Command. This is the only place you add a site. You should see Onboard a property on the right of the board.",
      },
      {
        title: "2. Fill Onboard a property",
        body: "Site name = human label (Acme Dating). Origin URL = https:// plus the host only — no /pricing, no trailing slash required. Example: https://acme-dating.com. IndexNow key is optional; leave blank unless the live site already serves /{key}.txt.",
      },
      {
        title: "3. Click Assign Grok fleet",
        body: "CiteFleet creates the property, copies the playbook into live tasks, and pins each task to one bot (Aether, Orion, Helios, Nimbus, Lyra, Vesper, Cassian, Forge, Sentinel). Properties on the KPI row increments. A new card appears for that domain.",
      },
      {
        title: "4. Click Live audit on that card",
        body: "CiteFleet fetches the origin for real: homepage and public routes with and without Accept: text/html, robots.txt, sitemap.xml, llms.txt. A JSON 404 without a special header is an SPA fallback bug — stop here and fix the site (Aether) before any listing.",
      },
      {
        title: "5. Open campaign",
        body: "Work P1 first: Repair SPA fallback, robots.txt AI crawlers, sitemap. Tick a box only when the live URL is actually fixed. Local audit on a technical card re-checks HTTP; Send to Grok hands that task's brief to Grok. Do not open Product Hunt while Aether is still blocked.",
      },
      {
        title: "6. List on BotCentral",
        body: "First prove control: the origin must serve /.well-known/botcentral.txt as plain text containing botcentral-verify=citefleet-app (Push origin files from the campaign and deploy, or put that same line in an apex DNS TXT record). Files CiteFleet wrote before already pass. Then on Command or the campaign header click List on BotCentral. Orion publishes a BotCentral 1.0 card. This is the bot-search catalog at botcentral.org. Assistants do not fill a submit form. You never paste a ChatGPT URL to get listed here.",
      },
      {
        title: "7. Confirm the listing",
        body: "Command shows Listed on BotCentral. Click it — that is the Card Inspector (human page) at botcentral.org/site/{domain}. Machine card is the JSON at /v1/site/{domain}. Search botcentral.org/v1/search?q=your-topic and the domain should appear. Refresh listing updates the card without wiping existing topics.",
      },
      {
        title: "8. Traditional search doors",
        body: "Helios: verify the domain in Google Search Console, submit the sitemap, URL-inspect key pages. Nimbus: Bing Webmaster Tools + IndexNow. That feeds Google, Gemini, AI Overviews, Bing, ChatGPT search, and Copilot. There is no ChatGPT webmaster portal.",
      },
      {
        title: "9. Mentions so answers cite you",
        body: "Indexing finds you. Citations need third-party pages. Lyra: three X posts with the exact domain. Vesper: Trustpilot, SmartCustomer, Product Hunt (Tue–Thu AM), AlternativeTo, SaaSHub. Cassian: press kit, then pitch. Always write the domain (acme-dating.com), not just the brand name. Tick the campaign boxes when each claim is actually live.",
      },
      {
        title: "10. Monitor",
        body: "Sentinel’s Local audit is the HTTP 200 sweep. Weekly: GSC + Bing AI Performance. If a route regresses to 404, re-dispatch Aether before more mentions. Listed on BotCentral plus GSC/Bing submitted = the site is in the CiteFleet pipeline. Mentions keep accumulating for months.",
      },
    ],
  },
  {
    slug: "command",
    number: "03",
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
    number: "04",
    title: "Onboard a property",
    summary: "Add a customer origin so the dispatcher creates the 11-task playbook and assigns the fleet.",
    where: "Command → Onboard a property",
    steps: [
      {
        title: "Site name",
        body: "Human label only, e.g. Acme Dating. It does not have to match the domain.",
      },
      {
        title: "Origin URL",
        body: "Must start with https:// and be the public origin with no trailing path, e.g. https://acme-dating.com",
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
    number: "05",
    title: "Live audit",
    summary: "The only automated inspection today: HTTP reality of the origin, mapped onto bot tasks.",
    where: "Property card → Live audit",
    steps: [
      {
        title: "What it fetches",
        body: "Where the site is hosted (Vercel, Netlify, GitHub Pages, Cloudflare, self-hosted, or unreachable) from DNS and response headers — this decides whether a pushed proof file goes live by itself. Then each public route with and without Accept: text/html (SPA-fallback class bugs), robots.txt, sitemap.xml, and the IndexNow key file when present.",
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
    number: "06",
    title: "Campaign board",
    summary: "One origin’s punch list. Every task has an owner bot, a checklist, and evidence.",
    where: "Open campaign",
    steps: [
      {
        title: "Priority order",
        body: "P1 is crawl integrity (SPA fallback, robots, sitemap). P2 is submit doors and Grok/X. P3 is directories, press, and app-health. P4 is ongoing monitor.",
      },
      {
        title: "Local audit and Send to Grok",
        body: "Local audit on a technical task re-runs the live audit; on a mention or press task it advances the next unchecked item. The BotCentral task row shows List on BotCentral instead, because that button publishes the card (same as the header button). Send to Grok copies the task brief for Grok to work. Checkboxes can also be toggled by hand when you finished the work outside the app.",
      },
      {
        title: "Remove property",
        body: "Campaign header → Remove property (confirm). Drops the site, its tasks, and its monitor snapshot; the audit log keeps the history and the BotCentral card is not touched. Use it for duplicates or test onboards.",
      },
      {
        title: "Blocked vs done",
        body: "Blocked means the auditor still sees a problem. Done means the checklist is complete. Waiting on the property card means most technical/submit work is done and you are accumulating citations.",
      },
    ],
  },
  {
    slug: "fleet",
    number: "07",
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
    number: "08",
    title: "Playbook",
    summary: "The versioned runbook every property follows. Tasks are instances of these steps.",
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
    number: "09",
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
    number: "10",
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
        body: "Helios → Google Search Console. Nimbus → Bing + IndexNow. Orion → List on BotCentral so GPTBot and PerplexityBot can find the 1.0 card.",
      },
      {
        title: "4. Mentions",
        body: "Lyra posts (Grok). Vesper directories. Cassian press. Always include the exact domain so assistants do not cite another product with the same name.",
      },
      {
        title: "5. Monitor",
        body: "Sentinel. Re-audit after each deploy. Re-dispatch if a check regresses.",
      },
    ],
  },
  {
    slug: "botcentral",
    number: "11",
    title: "BotCentral listing",
    summary:
      "CiteFleet publishes a 1.0 card. Assistants read botcentral.org — they never fill a submit form.",
    where: "Campaign → List on BotCentral, then botcentral.org/site/{domain}",
    steps: [
      {
        title: "Human vs machine",
        body: "The Card Inspector at /site/{domain} is for people. The machine card at /v1/site/{domain} is JSON for bots. Both are the same record.",
      },
      {
        title: "How to list",
        body: "Onboard the origin, run Live audit, get the botcentral-verify token live at /.well-known/botcentral.txt (Push origin files + deploy, or DNS TXT), then click List on BotCentral. BotCentral fetches that file and rejects the card if the token is missing or the path returns HTML. Orion POSTs with a service token. Bots cannot publish.",
      },
      {
        title: "How to confirm",
        body: "Command shows Listed on BotCentral. Search q=your-topic on botcentral.org. Open the inspector, not only the raw JSON tab.",
      },
      {
        title: "Top up an API key",
        body: "Developers mint a bc_live_ key at botcentral.org/keys; every job run is $1.00. Each Top up button on BotCentral opens citefleet.app/topup with that key prefix. The customer opens an invoice there and pays the quoted amount; an operator confirms receipt on the same page with the transaction hash, and BotCentral credits the prefix. Nothing on this page moves money by itself.",
      },
    ],
  },
  {
    slug: "control",
    number: "12",
    title: "Monitor, reconcile, kill switch",
    summary:
      "The control plane. Watch the origin, prove the card still matches, freeze acts if anything drifts.",
    where: "Monitor (nav)",
    steps: [
      {
        title: "Observe vs act",
        body: "Audit, monitor, and reconcile always run. Publish, mentions, spend, and autopilot are acts — the kill switch can freeze them.",
      },
      {
        title: "Run monitor + reconcile",
        body: "Probes each property (200 / 404 / SPA 404 / 402), pings citefleet.app and botcentral.org health, then scores ten checks. Drift blocks the next mention spike in policy even if a checkbox is ticked.",
      },
      {
        title: "Freeze",
        body: "Freeze all acts, or freeze one door (catalog, mentions, submissions, spend, autopilot). Thaw from the same page. Command and Campaign show a banner while frozen.",
      },
      {
        title: "Proof",
        body: "A done task with no evidence URL fails “Ticks have proof.” Do not tick Trustpilot without a live listing URL.",
      },
    ],
  },
  {
    slug: "webhook",
    number: "13",
    title: "Automate listing with a webhook",
    summary:
      "Prove control once, then let every deploy re-check the proof and refresh the card without anyone clicking.",
    where: "Campaign → Automatic listing",
    steps: [
      {
        title: "Verify proof first",
        body: "Click Verify proof on the campaign. CiteFleet applies BotCentral’s own rules: /.well-known/botcentral.txt must be plain text containing botcentral-verify=citefleet-app, or an apex DNS TXT record must carry that line. If it fails you get the exact line to add, and nothing is sent to BotCentral.",
      },
      {
        title: "Generate the secret",
        body: "Generate webhook secret creates a per-property secret and shows it once — copy it before leaving the page (rotate to get a new one). Paste the Payload URL and the secret into the website repo: Settings → Webhooks → Add webhook, content type application/json, events push and deployment_status.",
      },
      {
        title: "What a delivery does",
        body: "A push to the attached branch or a successful deployment_status makes CiteFleet re-check the proof (retrying for a few minutes while the deploy lands) and then List or Refresh the card. Anything else is answered and ignored. Every delivery shows under Last delivery and in the Audit log.",
      },
      {
        title: "Customers you do not host",
        body: "They do not need the webhook. A DNS TXT record proves control with no deploy at all; Verify proof, or autopilot while it is on, will pick it up. Any CI that is not GitHub can POST {domain} to /api/hooks/deployed with the same secret after a deploy. The webhook only makes listing immediate.",
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
      "Aether owns SPA fallback / crawl integrity. That is the SPA-fallback class of bug that makes Google mark URLs Not found.",
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
      "Open campaign — toggle the checklist or press Local audit on that task",
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
    prompt: "Why must mentions include the exact domain (acme-dating.com), not just the brand name “Acme Dating”?",
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
  {
    id: "q11",
    prompt: "Who is allowed to publish a site into BotCentral?",
    choices: [
      "Any crawler that finds a submit form",
      "ChatGPT, if the user pastes the URL",
      "CiteFleet only, via the private publish door after a live audit",
      "Anyone with a Google account",
    ],
    answer: 2,
    explain:
      "Bots never publish. CiteFleet POSTs a 1.0 card. Assistants only GET /v1/search and /v1/site/{domain}.",
  },
  {
    id: "q12",
    prompt: "Correct order to get a new website listed in CiteFleet?",
    choices: [
      "Product Hunt, then onboard, then audit",
      "Onboard → Live audit (fix 404s) → List on BotCentral → GSC/Bing → mentions",
      "Paste the URL into ChatGPT so it submits itself",
      "Only add robots.txt; CiteFleet lists the site automatically",
    ],
    answer: 1,
    explain:
      "Command onboard, prove crawl with Live audit, publish the BotCentral card, then traditional search doors, then citations. Mentions on a 404 origin are wasted.",
  },
  {
    id: "q13",
    prompt: "The kill switch on Monitor is designed to:",
    choices: [
      "Take the website offline",
      "Stop observe and act equally",
      "Freeze acts (publish, mentions, spend, autopilot) while monitor still runs",
      "Delete the BotCentral card",
    ],
    answer: 2,
    explain:
      "Observe always runs. Acts stop. That is the control-plane freeze, not a DNS take-down.",
  },
];

export const PASS_SCORE = 9;
