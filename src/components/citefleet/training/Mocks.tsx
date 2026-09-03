import { BrandLogo } from "../BrandLogo";
import { Pill } from "../Shell";

function Frame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#9b7dff]/30 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2">
        <span className="flex items-center gap-2">
          <BrandLogo size={18} className="h-[18px] w-[18px]" />
          <span className="mono text-[11px] uppercase tracking-[0.16em] text-[#e2c36d]">
            {label}
          </span>
        </span>
        <span className="text-[11px] text-[#9b95b3]">training mock — looks like the real screen</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-2xl border border-[#e2c36d]/20 bg-[#e2c36d]/8 px-3 py-2 text-sm text-[#e8d9a8]">
      {children}
    </p>
  );
}

export function MockCommand() {
  return (
    <Frame label="Command Center">
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          ["Workspace", "CiteFleet"],
          ["Properties", "1"],
          ["Bots assigned", "2/9"],
          ["Open tasks", "4"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/8 p-3">
            <p className="text-[10px] uppercase tracking-wide text-[#9b95b3]">{k}</p>
            <p className="mt-1 font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-white/8 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Pill tone="gold">waiting</Pill>
          <span className="mono text-xs text-[#9b95b3]">acme-dating.com</span>
        </div>
        <p className="font-semibold">Acme Dating</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full border border-[#9b7dff]/40 bg-[#9b7dff]/15 px-3 py-1 text-xs">
            1 Live audit
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs">2 Re-dispatch</span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#07060f]">
            3 Open campaign
          </span>
        </div>
      </div>
      <Callout>
        Use the numbered controls in this order on a new site: audit first, open the campaign
        board second, re-dispatch only if bots sat idle.
      </Callout>
    </Frame>
  );
}

export function MockOnboard() {
  return (
    <Frame label="Onboard a property">
      <div className="max-w-sm space-y-3 rounded-2xl border border-white/8 p-4">
        <label className="block text-[10px] uppercase text-[#9b95b3]">
          Site name
          <span className="mt-1 block rounded-xl border border-[#9b7dff]/40 bg-white/5 px-3 py-2 text-sm text-white">
            Acme Dating
          </span>
        </label>
        <label className="block text-[10px] uppercase text-[#9b95b3]">
          Origin URL
          <span className="mt-1 block rounded-xl border border-[#9b7dff]/40 bg-white/5 px-3 py-2 text-sm text-white">
            https://acme.example
          </span>
        </label>
        <label className="block text-[10px] uppercase text-[#9b95b3]">
          IndexNow key (optional)
          <span className="mt-1 block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#9b95b3]">
            leave blank unless the key file already exists
          </span>
        </label>
        <div className="rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-3 py-2 text-center text-sm font-semibold text-[#07060f]">
          Assign Grok fleet
        </div>
      </div>
      <Callout>
        Origin is the homepage host only — no /premium path. Assigning creates 11 tasks and
        pins each to a bot. That is the dispatcher.
      </Callout>
    </Frame>
  );
}

export function MockAudit() {
  return (
    <Frame label="Live audit result">
      <div className="space-y-2 text-sm">
        {[
          ["ok", "/  → 200 in 81ms  ·  HTML without special headers"],
          ["ok", "/premium  → 200  ·  no SPA fallback risk"],
          ["warn", "/guidelines  → 200  ·  crawled, not yet indexed (waiting phase)"],
          ["ok", "robots.txt  ·  OAI-SearchBot + PerplexityBot allowed"],
          ["ok", "sitemap.xml  ·  8 URLs"],
        ].map(([tone, line]) => (
          <div key={line} className="flex gap-2 rounded-xl border border-white/8 px-3 py-2">
            <span className={tone === "ok" ? "text-emerald-300" : "text-amber-200"}>
              {tone === "ok" ? "OK" : "WAIT"}
            </span>
            <span className="text-[#d7d1ea]">{line}</span>
          </div>
        ))}
      </div>
      <Callout>
        These rows are what Live audit writes onto Aether / Orion / Helios tasks. A JSON 404
        here would turn Aether red (SPA fallback).
      </Callout>
    </Frame>
  );
}

export function MockCampaign() {
  return (
    <Frame label="Campaign board">
      <div className="space-y-2">
        {[
          ["done", "AETHER", "Repair SPA fallback 404s", "P1"],
          ["done", "NIMBUS", "IndexNow instant-push", "P2"],
          ["assigned", "LYRA", "Grok / X live mention sequence", "P2"],
          ["queued", "VESPER", "Directory and review listings", "P3"],
        ].map(([status, bot, title, pri]) => (
          <div key={title} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/8 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={status === "done" ? "good" : status === "assigned" ? "gold" : "neutral"}>
                {status}
              </Pill>
              <Pill tone="violet">{bot}</Pill>
              <span>{title}</span>
            </div>
            <span className="mono text-[11px] text-[#9b95b3]">{pri} · Local audit</span>
          </div>
        ))}
      </div>
      <Callout>
        Tick a checkbox when you finished the work outside CiteFleet (posted to X, claimed
        Trustpilot). Local audit re-checks technical tasks against the live site.
      </Callout>
    </Frame>
  );
}

export function MockFleet() {
  return (
    <Frame label="Grok Fleet roster">
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["AETHER", "SPA / HTTP 200s", "Google, Bing"],
          ["HELIOS", "GSC + sitemap", "Gemini"],
          ["NIMBUS", "Bing + IndexNow", "ChatGPT"],
          ["ORION", "robots.txt", "Perplexity"],
          ["LYRA", "X posts", "Grok"],
          ["VESPER", "Directories", "citations"],
        ].map(([c, role, eng]) => (
          <div key={c} className="rounded-2xl border border-white/8 p-3">
            <p className="mono text-[11px] text-[#e2c36d]">{c}</p>
            <p className="mt-1 text-sm font-medium">{role}</p>
            <p className="text-xs text-[#9b95b3]">{eng}</p>
          </div>
        ))}
      </div>
      <Callout>
        One lever per card. ChatGPT is not a separate bot — Nimbus covers it because ChatGPT
        search reads Bing.
      </Callout>
    </Frame>
  );
}

export function MockPlaybook() {
  return (
    <Frame label="Playbook card">
      <div className="rounded-2xl border border-white/8 p-4">
        <p className="mono text-[11px] text-[#e2c36d]">NIMBUS · P2 · bing · indexnow · chatgpt</p>
        <p className="mt-2 font-semibold">IndexNow instant-push</p>
        <ul className="mt-3 space-y-1 text-sm text-[#cfc8e8]">
          <li>• Key file live at /{"{key}"}.txt</li>
          <li>• POST sitemap URLs → Accepted</li>
          <li>• Ping hooked to deploy</li>
        </ul>
      </div>
      <Callout>
        Playbook is the recipe book. It does not store your ticks. Those live on the campaign
        board for a specific domain.
      </Callout>
    </Frame>
  );
}

export function MockLog() {
  return (
    <Frame label="Audit log">
      <div className="space-y-2 font-mono text-xs">
        <div className="grid gap-2 border-b border-white/8 pb-2 sm:grid-cols-[140px_80px_1fr]">
          <span className="text-[#9b95b3]">8/29 5:51 PM</span>
          <span className="text-[#e2c36d]">Sentinel</span>
          <span>Live audit passed — 5 findings across 8 routes.</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_80px_1fr]">
          <span className="text-[#9b95b3]">8/29 5:40 PM</span>
          <span className="text-[#e2c36d]">Dispatcher</span>
          <span>Assigned LYRA → Grok / X mention sequence.</span>
        </div>
      </div>
      <Callout>
        Read right to left: when, which agent, what changed. Use this if a score moved and you
        did not click anything.
      </Callout>
    </Frame>
  );
}

export function MockWorkflow() {
  return (
    <Frame label="Operating sequence">
      <ol className="grid gap-2 sm:grid-cols-5">
        {[
          ["1", "Onboard + audit"],
          ["2", "robots / sitemap"],
          ["3", "GSC + Bing"],
          ["4", "X / dirs / press"],
          ["5", "Monitor"],
        ].map(([n, label]) => (
          <li key={n} className="rounded-2xl border border-white/8 p-3 text-center">
            <p className="mono text-[#e2c36d]">{n}</p>
            <p className="mt-1 text-sm">{label}</p>
          </li>
        ))}
      </ol>
      <Callout>
        Do not launch Product Hunt (step 4) if step 1 still shows SPA 404s. Crawlers will hit
        a dead page during the mention spike.
      </Callout>
    </Frame>
  );
}

export function MockOverview() {
  return (
    <Frame label="How assistants find a site">
      <table className="w-full text-left text-xs">
        <thead className="text-[#9b95b3]">
          <tr>
            <th className="pb-2 font-medium">Assistant</th>
            <th className="pb-2 font-medium">Reads</th>
            <th className="pb-2 font-medium">Bot</th>
          </tr>
        </thead>
        <tbody className="text-[#e8e4f6]">
          {[
            ["ChatGPT / Copilot", "Bing + OAI-SearchBot", "Nimbus"],
            ["Gemini / AI Overviews", "Google index", "Helios"],
            ["Perplexity", "Own crawler + Bing + links", "Orion + mentions"],
            ["Claude", "Brave + links", "Orion + mentions"],
            ["Grok", "Live X posts", "Lyra"],
          ].map((row) => (
            <tr key={row[0]} className="border-t border-white/8">
              {row.map((cell) => (
                <td key={cell} className="py-2 pr-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Callout>
        If a row has no submit door, the work is robots.txt plus public mentions — not another
        API key.
      </Callout>
    </Frame>
  );
}

export function MockListSite() {
  return (
    <Frame label="List a website — the real buttons">
      <ol className="space-y-2 text-sm">
        {[
          ["1", "Command", "Onboard a property → Assign Grok fleet"],
          ["2", "Property card", "Live audit — stop if any route is JSON 404"],
          ["3", "Open campaign", "P1: SPA fallback, robots.txt, sitemap"],
          ["4", "List on BotCentral", "Inspector at /site/{domain}, JSON at /v1/site/{domain}"],
          ["5", "Helios + Nimbus", "Google Search Console, Bing, IndexNow"],
          ["6", "Lyra / Vesper / Cassian", "X posts, directories, press — exact domain"],
          ["7", "Sentinel", "Local audit + weekly GSC/Bing. Re-dispatch if a 404 returns"],
        ].map(([n, where, action]) => (
          <li
            key={n}
            className="grid gap-1 rounded-2xl border border-white/8 px-3 py-2 sm:grid-cols-[2rem_9rem_1fr] sm:items-center"
          >
            <span className="mono text-[#e2c36d]">{n}</span>
            <span className="font-medium">{where}</span>
            <span className="text-[#cfc8e8]">{action}</span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-[#9b7dff]/40 bg-[#9b7dff]/15 px-3 py-1 text-xs">
          Live audit
        </span>
        <span className="rounded-full border border-emerald-400/40 px-3 py-1 text-xs text-emerald-200">
          List on BotCentral
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#07060f]">
          Open campaign
        </span>
      </div>
      <Callout>
        Those three controls are the real Command buttons. Audit first. List on BotCentral
        after crawl is clean. Mentions last.
      </Callout>
    </Frame>
  );
}

export function MockControl() {
  return (
    <Frame label="Monitor · kill switch">
      <div className="flex flex-wrap gap-2">
        {["Catalog open", "Mentions open", "Spend frozen", "Autopilot open"].map((l) => (
          <span
            key={l}
            className={`rounded-full px-3 py-1 text-xs ${
              l.includes("frozen")
                ? "border border-rose-400/40 text-rose-200"
                : "border border-white/10"
            }`}
          >
            {l}
          </span>
        ))}
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <p className="text-emerald-300">PASS · Marketing URLs 200</p>
        <p className="text-amber-200">WARN · Tick without proof URL (Trustpilot)</p>
        <p className="text-emerald-300">PASS · BotCentral card listed</p>
      </div>
      <Callout>
        Observe still runs when frozen. List on BotCentral will refuse until you thaw Catalog.
      </Callout>
    </Frame>
  );
}

export function LessonMock({ slug }: { slug: string }) {
  switch (slug) {
    case "overview":
      return <MockOverview />;
    case "list-a-site":
      return <MockListSite />;
    case "command":
      return <MockCommand />;
    case "onboard":
      return <MockOnboard />;
    case "audit":
      return <MockAudit />;
    case "campaign":
      return <MockCampaign />;
    case "fleet":
      return <MockFleet />;
    case "playbook":
      return <MockPlaybook />;
    case "activity":
      return <MockLog />;
    case "workflow":
      return <MockWorkflow />;
    case "botcentral":
      return <MockListSite />;
    case "control":
      return <MockControl />;
    default:
      return null;
  }
}
