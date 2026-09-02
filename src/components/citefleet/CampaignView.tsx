import { Link, useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();
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
              Not listed on bot search yet. Audit the origin, serve the proof token (Push
              origin files, then deploy that repo), then List on BotCentral.
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
          <button
            className="rounded-full border border-rose-400/40 px-4 py-2 text-sm text-rose-200 hover:bg-rose-400/10"
            disabled={!!fleet.busy}
            onClick={async () => {
              if (
                !window.confirm(
                  `Remove ${site.domain} (${site.name}) from this workspace? Its tasks and monitor snapshot are dropped. The BotCentral card is not touched.`,
                )
              ) {
                return;
              }
              if (await fleet.removeProperty(site.id)) void navigate({ to: "/" });
            }}
          >
            {fleet.busy === "remove" ? "Removing…" : "Remove property"}
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
      <AutoListingPanel site={site} fleet={fleet} />

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

function AutoListingPanel({
  site,
  fleet,
}: {
  site: Site;
  fleet: ReturnType<typeof useFleet>;
}) {
  const proof = site.proof;
  const hook = site.webhook;
  // The secret is shown once, right after generate/rotate; the store never carries it.
  const [revealed, setRevealed] = useState<{ secret: string; payloadUrl: string; deployedUrl: string } | null>(null);
  const payload = revealed?.payloadUrl ?? "https://citefleet.app/api/hooks/github";
  const deployed = revealed?.deployedUrl ?? "https://citefleet.app/api/hooks/deployed";
  const hasSecret = Boolean(hook?.createdAt);
  return (
    <section className="glass rounded-3xl p-5" data-testid="auto-listing">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
            Automatic listing
          </p>
          <h2 className="mt-1 text-lg font-semibold">Origin proof and GitHub webhook</h2>
          <p className="mt-1 max-w-xl text-sm text-[#b7b0cc]">
            CiteFleet checks the proof with BotCentral’s own rules before it publishes. A
            webhook from the website repo triggers that check and the listing automatically
            after every deploy.
          </p>
        </div>
        <Pill tone={proof?.proven ? "good" : "warn"}>
          {proof ? (proof.proven ? `proof ${proof.method}` : "proof not live") : "proof unchecked"}
        </Pill>
      </div>
      {proof && (
        <p className="mt-3 text-xs text-[#9b95b3]" data-testid="proof-note">
          {proof.note} · checked {new Date(proof.checkedAt).toLocaleString()}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          disabled={!!fleet.busy}
          onClick={() => fleet.verifyProof(site.id)}
        >
          {fleet.busy === "proof" ? "Checking…" : "Verify proof"}
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          disabled={!!fleet.busy}
          onClick={async () => {
            const r = await fleet.webhookSecret(site.id, hasSecret);
            if (r) setRevealed({ secret: r.secret, payloadUrl: r.payloadUrl, deployedUrl: r.deployedUrl });
          }}
        >
          {fleet.busy === "webhook" ? "Working…" : hasSecret ? "Rotate webhook secret" : "Generate webhook secret"}
        </button>
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[160px_1fr]">
        <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">Payload URL</dt>
        <dd className="mono break-all text-[#cfc8e8]" data-testid="webhook-url">{payload}</dd>
        <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">Secret</dt>
        <dd className="mono break-all text-[#cfc8e8]" data-testid="webhook-secret">
          {revealed
            ? revealed.secret
            : hasSecret
              ? `set ${new Date(hook!.createdAt).toLocaleString()} · shown only when generated — rotate to get a new one`
              : "— generate one, then paste it into the repo’s webhook settings"}
        </dd>
        {revealed && (
          <>
            <dt></dt>
            <dd className="text-xs text-amber-200">Copy it now. It is not stored where the browser can read it again.</dd>
          </>
        )}
        <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">Any other CI</dt>
        <dd className="text-[#cfc8e8]">
          after a deploy, POST <span className="mono">{"{\"domain\":\""}{site.domain}{"\"}"}</span> to{" "}
          <span className="mono break-all" data-testid="deployed-url">{deployed}</span> with{" "}
          <span className="mono">X-CiteFleet-Signature: sha256=HMAC(body, secret)</span>
        </dd>
        <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">Events</dt>
        <dd className="text-[#cfc8e8]">
          push (branch <span className="mono">{site.github?.branch || "main"}</span>) and deployment_status · content type
          application/json
        </dd>
        <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">Last delivery</dt>
        <dd className="text-[#cfc8e8]" data-testid="webhook-last">
          {hook?.lastEventAt
            ? `${hook.lastEvent} · ${new Date(hook.lastEventAt).toLocaleString()}${hook.lastResult ? ` · ${hook.lastResult}` : ""}`
            : "none yet"}
        </dd>
      </dl>
    </section>
  );
}

function GithubPanel({
  site,
  fleet,
}: {
  site: Site;
  fleet: ReturnType<typeof useFleet>;
}) {
  const [owner, setOwner] = useState(site.github?.owner || "");
  const [repo, setRepo] = useState(site.github?.repo || "");
  const [branch, setBranch] = useState(site.github?.branch || "main");
  const [root, setRoot] = useState(site.github?.root || "public");
  const connected = Boolean(site.github?.owner && site.github.repo);
  const tokenReady = Boolean(fleet.store?.workspace.githubToken);
  const canPush = Boolean(owner.trim() && repo.trim());
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
            Writes robots.txt, sitemap.xml, llms.txt, and .well-known/botcentral.txt
            into <span className="mono">{root || "public"}/</span> on{" "}
            <span className="mono">{owner || "owner"}/{repo || "repo"}</span>.
            Push saves the repo first, then commits.
          </p>
          {site.verifyToken && (
            <p className="mt-2 break-all text-xs text-[#9b95b3]">
              BotCentral proof line the file must carry:{" "}
              <span className="mono text-[#cfc8e8]">botcentral-verify={site.verifyToken}</span>
              {" "}(or the same value in an apex DNS TXT record).
            </p>
          )}
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
      {!tokenReady && (
        <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          No GitHub token on this workspace. Open{" "}
          <Link to="/" className="underline">
            Command
          </Link>{" "}
          and save a classic PAT with repo scope, then push again.
        </p>
      )}
      <form
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void fleet.attachGithub({ siteId: site.id, owner, repo, branch, root });
        }}
      >
        <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          GitHub owner
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="mitchvac"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          GitHub repo
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="website-repo"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          Branch
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
          Folder
          <input
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm normal-case tracking-normal text-white"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="public"
          />
        </label>        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button
            className="rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
            disabled={!!fleet.busy || !canPush}
          >
            {fleet.busy === "github" ? "Saving…" : "Save repo"}
          </button>
          <button
            type="button"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f] disabled:opacity-40"
            disabled={!!fleet.busy || !canPush}
            onClick={() =>
              fleet.pushOriginPack({
                siteId: site.id,
                owner,
                repo,
                branch,
                root,
              })
            }
          >
            {fleet.busy === "origin" ? "Pushing…" : "Push origin files"}
          </button>
          {fleet.busy === "origin" && (
            <span className="text-xs text-[#9b95b3]">Saving repo, then committing to GitHub…</span>
          )}
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
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#c4b5fd] underline decoration-white/20 underline-offset-2 hover:text-white"
                >
                  {item.label}
                  <span className="ml-1 text-[10px] no-underline opacity-70">↗</span>
                </a>
              ) : (
                item.label
              )}
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
