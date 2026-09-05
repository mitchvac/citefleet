import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useFleet } from "@/lib/citefleet/client";
import { Pill, Score } from "./Shell";
import { scoredTasks } from "@/lib/citefleet/playbook";
import type { Site, SiteMonitor, Task } from "@/lib/citefleet/types";

function statusTone(status: string) {
  if (["done", "indexed", "covered", "ok"].includes(status)) return "good" as const;
  if (["waiting", "assigned", "in-progress", "campaign"].includes(status))
    return "gold" as const;
  if (["blocked", "failed", "critical"].includes(status)) return "bad" as const;
  if (["running", "working", "auditing"].includes(status)) return "violet" as const;
  return "neutral" as const;
}

export function CommandBoard() {
  const fleet = useFleet();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [key, setKey] = useState("");
  const [ghOwner, setGhOwner] = useState("");
  const [ghRepo, setGhRepo] = useState("");
  const [ghToken, setGhToken] = useState("");
  const autopilotOn = Boolean(fleet.store?.workspace.autopilot);

  // Latest tick fn without re-arming the interval every render (useFleet
  // returns a fresh object each time).
  const tickRef = useRef(fleet.tickAutopilot);
  tickRef.current = fleet.tickAutopilot;
  useEffect(() => {
    if (!autopilotOn) return;
    const id = window.setInterval(() => {
      void tickRef.current();
    }, 3 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [autopilotOn]);

  if (fleet.loading) {
    return <p className="text-[#9b95b3]">Loading workspace…</p>;
  }
  if (!fleet.store) {
    return <p className="text-rose-300">{fleet.error || "Workspace unavailable"}</p>;
  }

  const { sites, bots, tasks, engines, activity, workspace, control } = fleet.store;
  const openTasks = tasks.filter((t) => t.status !== "done").length;
  const working = bots.filter((b) => b.status === "working" || b.status === "assigned").length;
  const rankedSites = [...sites].sort((a, b) => {
    const listed = Number(Boolean(b.botcentral?.listed)) - Number(Boolean(a.botcentral?.listed));
    if (listed) return listed;
    return (b.scores.overall || 0) - (a.scores.overall || 0);
  });
  const listedSites = rankedSites.filter((s) => s.botcentral?.listed);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-4">
        <Kpi label="Workspace" value={workspace.name} hint={workspace.plan} />
        <Kpi
          label="On BotCentral"
          value={`${listedSites.length}/${sites.length}`}
          hint="live catalog cards"
        />
        <Kpi label="Bots assigned" value={`${working}/${bots.length}`} hint="Grok fleet" />
        <Kpi label="Open tasks" value={String(openTasks)} hint="playbook remaining" />
      </section>

      {fleet.error && (
        <div className="glass rounded-2xl px-4 py-3 text-sm text-rose-300">{fleet.error}</div>
      )}

      {listedSites.length > 0 && (
        <section className="glass rounded-3xl p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
            Live catalog cards
          </p>
          <p className="mt-1 text-sm text-[#cfc8e8]">
            CiteFleet already published these. BotCentral Index is a search box — open the
            inspector URL below. Do not wait for the homepage to list the card.
          </p>
          <ul className="mt-3 space-y-2">
            {listedSites.map((site) => (
              <li key={site.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{site.name}</span>
                <span className="mono text-xs text-[#9b95b3]">{site.domain}</span>
                <a
                  href={site.botcentral?.href || `https://botcentral.org/site/${site.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#4ee0c3] underline"
                >
                  inspector
                </a>
                <a
                  href={site.botcentral?.api || `https://botcentral.org/v1/site/${site.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#c4b5fd] underline"
                >
                  machine JSON
                </a>
                <a
                  href={`https://botcentral.org/v1/search?q=${encodeURIComponent(site.domain)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#9b95b3] underline"
                >
                  search hit
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {workspace && fleet.store.control.kill.global && (
        <Link
          to="/ops"
          className="block rounded-3xl border border-rose-400/30 bg-rose-400/10 px-5 py-4"
        >
          <p className="text-sm font-semibold text-rose-200">Kill switch is on</p>
          <p className="mt-1 text-sm text-[#cfc8e8]">
            Observe still runs. Publish, mentions, spend, and autopilot acts are frozen.
            Open Monitor to thaw.
          </p>
        </Link>
      )}

      <section className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">Autopilot</p>
          <p className="mt-1 text-sm text-[#cfc8e8]">
            {workspace.autopilot
              ? `On — Sentinel re-audits every 3 minutes${workspace.autopilotLastTickAt ? ` · last tick ${new Date(workspace.autopilotLastTickAt).toLocaleString()}` : ""}.`
              : "Off — audits and Grok drafts only run when you click."}
          </p>
          <p className="mt-1 text-xs text-[#9b95b3]">
            Set XAI_API_KEY in .env.local to have Grok write mention drafts into task evidence. Autopilot does not log into Bing or X.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/ops"
            className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          >
            Open Monitor
          </Link>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              workspace.autopilot ? "bg-emerald-300 text-[#07060f]" : "btn-light"
            }`}
            disabled={!!fleet.busy}
            onClick={() => fleet.setAutopilot(!workspace.autopilot)}
          >
            {workspace.autopilot ? "Stop autopilot" : "Start autopilot"}
          </button>
        </div>
      </section>

      {/* First thing on the page for someone who has not listed anything yet.
          Once a property exists it stops being the loudest element and moves
          out of the way. */}
      <section className="glass rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">
              {sites.length ? "Listing another site?" : "New here? Start with the three steps"}
            </h2>
            <p className="mt-1 text-sm text-[#9b95b3]">
              Get a BotCentral API key, add credit to it, then work the training
              module to get indexed.
            </p>
          </div>
          <Link
            to="/start"
            data-testid="get-started"
            className="shrink-0 rounded-full bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-5 py-2.5 text-center text-sm font-semibold text-[#07060f] no-underline"
          >
            Get started
          </Link>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-4">
          {rankedSites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              tasks={tasks.filter((t) => t.siteId === site.id)}
              monitor={control.snapshots[site.id]}
              busy={fleet.busy}
              onDispatch={() => fleet.dispatch(site.id)}
              onAudit={() => fleet.audit(site.id)}
              onPublish={() => fleet.publishListing(site.id)}
            />
          ))}
        </div>

        <aside className="glass rounded-3xl p-5">
          <h2 className="mb-1 text-sm font-semibold">Onboard a property</h2>
          <p className="mb-4 text-sm text-[#9b95b3]">
            Grok Dispatcher will assign each specialist bot a playbook task for Google,
            Bing, IndexNow, Grok, ChatGPT, and BotCentral bot-search listings.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              fleet.onboard({
                name,
                url,
                indexNowKey: key || undefined,
                github:
                  ghOwner && ghRepo
                    ? { owner: ghOwner, repo: ghRepo, branch: "main", root: "public" }
                    : undefined,
              });
            }}
          >
            <Field label="Site name">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#9b7dff]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Dating"
              />
            </Field>
            <Field label="Origin URL">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#9b7dff]"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </Field>
            <Field label="IndexNow key (optional)">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#9b7dff]"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="public verification key"
              />
            </Field>
            <Field label="GitHub owner">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#9b7dff]"
                value={ghOwner}
                onChange={(e) => setGhOwner(e.target.value)}
                placeholder="mitchvac"
              />
            </Field>
            <Field label="GitHub repo (origin files land in public/)">
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#9b7dff]"
                value={ghRepo}
                onChange={(e) => setGhRepo(e.target.value)}
                placeholder="citefleet"
              />
            </Field>
            <button
              className="w-full rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#4ee0c3] px-4 py-2.5 text-sm font-semibold text-[#07060f] disabled:opacity-50"
              disabled={!!fleet.busy || !url.startsWith("http")}
            >
              {fleet.busy === "onboard" ? "Dispatching…" : "Assign Grok fleet"}
            </button>
          </form>
        </aside>
      </section>

      <section className="glass rounded-3xl p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
          GitHub token — all properties
        </p>
        <p className="mt-1 text-sm text-[#b7b0cc]">
          One classic PAT with <span className="mono">repo</span> scope. CiteFleet uses it
          to push robots.txt, sitemap.xml, llms.txt, and .well-known/botcentral.txt into
          each site’s repo. Token is not shown back.
          {workspace.githubToken ? " Status: stored." : " Status: missing."}
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ghToken.trim()) return;
            void fleet.setGithubToken(ghToken.trim()).then(() => setGhToken(""));
          }}
        >
          <input
            type="password"
            autoComplete="off"
            className="min-w-[16rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#9b7dff]"
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            placeholder="ghp_…"
          />
          <button
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]"
            disabled={!!fleet.busy || !ghToken.trim()}
          >
            Save token
          </button>
        </form>
      </section>

      <section className="glass rounded-3xl p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-semibold">Answer-engine coverage</h2>
            <p className="text-sm text-[#9b95b3]">
              How each assistant actually finds a site — and which bot owns the lever.
            </p>
          </div>
        </div>
        {/* min-w-0 is what makes overflow-x-auto work here. A grid/flex child
            defaults to min-width:auto, so it grows to its content instead of
            scrolling — the 720px table pushed the whole page 84px wide on a
            phone rather than scrolling inside this box. */}
        <div className="min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-[#9b95b3]">
              <tr>
                <th className="pb-3 font-medium">System</th>
                <th className="pb-3 font-medium">Primary source</th>
                <th className="pb-3 font-medium">Submission door</th>
                <th className="pb-3 font-medium">Our lever</th>
                <th className="pb-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {engines.map((engine) => (
                <tr key={engine.engine} className="border-t border-white/8">
                  <td className="py-3 font-medium">{engine.label}</td>
                  <td className="py-3 text-[#cfc8e8]">{engine.primarySource}</td>
                  <td className="py-3 text-[#cfc8e8]">{engine.submissionDoor}</td>
                  <td className="py-3 text-[#cfc8e8]">{engine.lever}</td>
                  <td className="py-3">
                    <Pill tone={statusTone(engine.status)}>{engine.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass rounded-3xl p-5">
        <h2 className="mb-4 text-sm font-semibold">Latest ops events</h2>
        {/* Rows stack on a phone. The two fixed columns (w-40 + w-32) ate 288px
            of a 390px screen and left the message rendering one word per line;
            they only become columns once there is room for them. */}
        <ol className="space-y-3">
          {activity.slice(0, 8).map((event) => (
            <li key={event.id} className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-3">
              <span className="mono text-[11px] text-[#9b95b3] sm:w-40 sm:shrink-0">
                {new Date(event.at).toLocaleString()}
              </span>
              <span className="text-xs text-[#e2c36d] sm:w-32 sm:shrink-0 sm:text-sm">
                {event.actor}
              </span>
              <span className="min-w-0 text-[#e8e4f6]">{event.message}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass rounded-3xl p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#9b95b3]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[#9b95b3]">{hint}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-[#9b95b3]">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * The recurring watch is not a checklist item, so it is reported as state rather
 * than counted toward a total. Every branch is a real value from the last
 * monitor cycle (`drift` is set when any non-info check failed); "not run" means
 * no snapshot exists, never "fine".
 */
function monitorState(monitor?: SiteMonitor) {
  if (!monitor) return { label: "not run", className: "text-[#9b95b3]" };
  if (monitor.blockedByKill) return { label: "held", className: "text-[#e2c36d]" };
  if (monitor.drift) return { label: "regressed", className: "text-[#e2c36d]" };
  return { label: "green", className: "text-emerald-300" };
}

function SiteCard({
  site,
  tasks,
  monitor,
  busy,
  onDispatch,
  onAudit,
  onPublish,
}: {
  site: Site;
  tasks: Task[];
  monitor?: SiteMonitor;
  busy: string | null;
  onDispatch: () => void;
  onAudit: () => void;
  onPublish: () => void;
}) {
  // Count exactly the tasks the three scores average, so this total and the
  // Technical / Submissions / Mentions figures describe the same work. `monitor`
  // is scored by nothing and is excluded from both (see SCORE_BUCKETS).
  const scored = scoredTasks(tasks);
  const done = scored.filter((t) => t.status === "done").length;
  return (
    <article className="glass rounded-3xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Pill tone={statusTone(site.status)}>{site.status}</Pill>
            <span className="mono text-xs text-[#9b95b3]">{site.domain}</span>
            {site.botcentral?.listed ? (
              <a
                href={site.botcentral.href || `https://botcentral.org/site/${site.domain}`}
                target="_blank"
                rel="noreferrer"
                className="no-underline"
              >
                {/* Listed is not the same as proven: BotCentral leaves a card up
                    after its 6-hourly recheck stops finding the proof token. */}
                <Pill tone={site.botcentral.verified === false ? "gold" : "good"}>
                  {site.botcentral.verified === false
                    ? "On BotCentral · unverified"
                    : "Listed on BotCentral"}
                </Pill>
              </a>
            ) : (
              <Pill tone="gold">Not on BotCentral</Pill>
            )}
            {site.hosting && (
              <span title={site.hosting.evidence.join(" · ")} data-testid="hosting">
                <Pill tone={site.hosting.provider === "unreachable" ? "bad" : "neutral"}>
                  {site.hosting.label}
                </Pill>
              </span>
            )}
          </div>
          <h2 className="text-xl font-semibold">{site.name}</h2>
          <p className="mt-1 max-w-xl text-sm text-[#b7b0cc]">{site.summary}</p>
          {site.botcentral?.listed ? (
            <p className="mt-2 break-all font-mono text-xs text-[#4ee0c3]">
              {site.botcentral.href || `https://botcentral.org/site/${site.domain}`}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAudit}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
            disabled={!!busy}
          >
            {busy === "audit" ? "Auditing…" : "Live audit"}
          </button>
          <button
            onClick={onPublish}
            className="rounded-full border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
            disabled={!!busy}
          >
            {busy === "publish"
              ? "Publishing…"
              : site.botcentral?.listed
                ? "Refresh listing"
                : "List on BotCentral"}
          </button>
          <button
            onClick={onDispatch}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-50"
            disabled={!!busy}
          >
            Re-dispatch
          </button>
          <Link
            to="/sites/$id"
            params={{ id: site.id }}
            className="btn-light rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            Open campaign
          </Link>
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Score label="Technical" value={site.scores.technical} />
        <Score label="Submissions" value={site.scores.submissions} />
        <Score label="Mentions" value={site.scores.mentions} />
      </div>
      <p className="mt-4 text-xs text-[#9b95b3]">
        {done}/{scored.length} playbook tasks ·{" "}
        <span className={monitorState(monitor).className}>
          monitor: {monitorState(monitor).label}
        </span>
        {site.lastAuditAt
          ? ` · last audit ${new Date(site.lastAuditAt).toLocaleString()}`
          : ""}
      </p>
    </article>
  );
}
