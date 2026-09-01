import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useFleet } from "@/lib/citefleet/client";
import { Pill } from "./Shell";
import { GrokHandoff } from "./GrokHandoff";
import type { Site, Task } from "@/lib/citefleet/types";

function tone(status: string) {
  if (status === "done") return "good" as const;
  if (status === "blocked" || status === "failed") return "bad" as const;
  if (status === "running") return "violet" as const;
  if (status === "assigned") return "gold" as const;
  return "neutral" as const;
}

export function CampaignView({ siteId }: { siteId: string }) {
  const fleet = useFleet();
  if (fleet.loading || !fleet.store) {
    return <p className="text-[#9b95b3]">Loading campaign…</p>;
  }
  const site = fleet.store.sites.find((s) => s.id === siteId);
  if (!site) {
    return <p className="text-rose-300">Property not found.</p>;
  }
  const tasks = fleet.store.tasks
    .filter((t) => t.siteId === siteId)
    .sort((a, b) => a.priority - b.priority);
  const bots = fleet.store.bots;
  const frozen = fleet.store.control?.kill.global;

  return (
    <div className="space-y-6">
      {frozen ? (
        <Link
          to="/ops"
          className="block rounded-3xl border border-rose-400/30 bg-rose-400/10 px-5 py-4 text-sm text-rose-100"
        >
          Kill switch is on — Run bot / List on BotCentral will refuse until you thaw on Monitor.
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/" className="text-xs text-[#9b95b3] hover:text-white">
            ← Command
          </Link>
          <div className="mt-3 flex items-center gap-2">
            <Pill tone="gold">{site.status}</Pill>
            <span className="mono text-xs text-[#9b95b3]">{site.domain}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">{site.name}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#b7b0cc]">{site.summary}</p>
          {site.botcentral?.listed ? (
            <p className="mt-2 text-sm text-emerald-300">
              Live on BotCentral —{" "}
              <a
                href={site.botcentral.href}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                inspector
              </a>
              {site.botcentral.api ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={site.botcentral.api}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    machine card
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#e2c36d]">
              Not listed on bot search yet. Audit the origin, then List on BotCentral.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
            onClick={() => fleet.audit(site.id)}
            disabled={!!fleet.busy}
          >
            Run live audit
          </button>
          <button
            className="rounded-full border border-emerald-400/40 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-400/10"
            onClick={() => fleet.publishListing(site.id)}
            disabled={!!fleet.busy}
          >
            {fleet.busy === "publish"
              ? "Publishing…"
              : site.botcentral?.listed
                ? "Refresh BotCentral card"
                : "List on BotCentral"}
          </button>
          <button
            className="btn-light rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => fleet.dispatch(site.id)}
            disabled={!!fleet.busy}
          >
            Grok re-assign
          </button>
        </div>
      </div>

      {fleet.error && (
        <div className="glass rounded-2xl px-4 py-3 text-sm text-rose-300">{fleet.error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Overall" value={`${site.scores.overall}`} />
        <Stat label="Technical" value={`${site.scores.technical}`} />
        <Stat label="Submissions" value={`${site.scores.submissions}`} />
        <Stat label="Mentions" value={`${site.scores.mentions}`} />
      </div>

      <GithubPanel site={site} fleet={fleet} />

      <div className="glass rounded-3xl p-2 md:p-4">
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              site={site}
              task={task}
              botName={bots.find((b) => b.id === task.botId)?.callsign}
              busy={fleet.busy}
              onRun={() => fleet.runTask(task.id)}
              onToggle={(checklistId, done) =>
                fleet.patchTask(task.id, { checklistId, done })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GithubPanel({
  site,
  fleet,
}: {
  site: Site;
  fleet: ReturnType<typeof useFleet>;
}) {
  const [owner, setOwner] = useState(site.github?.owner || "mitchvac");
  const [repo, setRepo] = useState(site.github?.repo || "");
  const [branch, setBranch] = useState(site.github?.branch || "main");
  const [root, setRoot] = useState(site.github?.root || "public");
  const connected = Boolean(site.github?.owner && site.github.repo);
  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
            Origin files → GitHub
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {connected
              ? `${site.github!.owner}/${site.github!.repo}`
              : "Attach this site’s repo"}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[#b7b0cc]">
            Every property needs its own repo. CiteFleet writes robots.txt, sitemap.xml,
            llms.txt, and .well-known/botcentral.txt into <span className="mono">{root || "public"}/</span>.
            Then you deploy that repo. Files are not created on citefleet.app.
          </p>
          {site.github?.lastPushUrl && (
            <p className="mt-2 text-xs text-[#9b95b3]">
              Last push{" "}
              <a href={site.github.lastPushUrl} className="underline" target="_blank" rel="noreferrer">
                {site.github.lastPushSha?.slice(0, 7) || "commit"}
              </a>
              {site.github.lastPushAt
                ? ` · ${new Date(site.github.lastPushAt).toLocaleString()}`
                : ""}
            </p>
          )}
        </div>
        <Pill tone={connected ? "good" : "warn"}>{connected ? "repo attached" : "no repo"}</Pill>
      </div>
      <form
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void fleet.attachGithub({ siteId: site.id, owner, repo, branch, root });
        }}
      >
        <input
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="owner"
        />
        <input
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="repo"
        />
        <input
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="main"
        />
        <input
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
          value={root}
          onChange={(e) => setRoot(e.target.value)}
          placeholder="public"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
            disabled={!!fleet.busy || !owner || !repo}
          >
            Save repo
          </button>
          <button
            type="button"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]"
            disabled={!!fleet.busy || !connected}
            onClick={() => fleet.pushOriginPack(site.id)}
          >
            {fleet.busy === "origin" ? "Pushing…" : "Push origin files"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-3xl p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function TaskRow({
  site,
  task,
  botName,
  busy,
  onRun,
  onToggle,
}: {
  site: Site;
  task: Task;
  botName?: string;
  busy: string | null;
  onRun: () => void;
  onToggle: (id: string, done: boolean) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/8 bg-white/3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill tone={tone(task.status)}>{task.status}</Pill>
            <span className="mono text-[11px] text-[#9b95b3]">P{task.priority}</span>
            {botName && <Pill tone="violet">{botName}</Pill>}
            {task.assignedBy && (
              <span className="text-[11px] text-[#9b95b3]">{task.assignedBy}</span>
            )}
          </div>
          <h3 className="font-semibold">{task.title}</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#b7b0cc]">{task.description}</p>
          {task.blockedReason && (
            <p className="mt-2 text-sm text-rose-300">{task.blockedReason}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <GrokHandoff site={site} task={task} botName={botName} />
          <button
            onClick={onRun}
            disabled={!!busy || task.status === "done"}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-40"
          >
            Local audit
          </button>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {task.checklist.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm text-[#d7d1ea]">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => onToggle(item.id, e.target.checked)}
              className="mt-1"
            />
            <span className={item.done ? "text-[#9b95b3] line-through" : ""}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
      {task.evidence[0] && (
        <p className="mt-3 text-xs text-[#9b95b3]">
          Latest evidence: {task.evidence[0].label}
          {task.evidence[0].detail ? ` — ${task.evidence[0].detail}` : ""}
        </p>
      )}
    </article>
  );
}
