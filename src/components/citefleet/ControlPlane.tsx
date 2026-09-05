import { Link } from "@tanstack/react-router";
import { useFleet } from "@/lib/citefleet/client";
import { Pill } from "./Shell";
import type { ActDoor, ReconcileCheck, SiteMonitor } from "@/lib/citefleet/types";

const DOORS: Array<{ id: ActDoor; label: string; hint: string }> = [
  { id: "catalog", label: "Catalog", hint: "BotCentral publish" },
  { id: "mentions", label: "Mentions", hint: "X, directories, press" },
  { id: "submissions", label: "Submissions", hint: "GSC, Bing, IndexNow" },
  { id: "spend", label: "Spend", hint: "x402 / PayAI" },
  { id: "autopilot", label: "Autopilot", hint: "Sentinel acts" },
];

function checkTone(c: ReconcileCheck) {
  if (!c.ok && c.severity === "critical") return "bad" as const;
  if (!c.ok) return "warn" as const;
  if (c.severity === "info") return "neutral" as const;
  return "good" as const;
}

function Snapshot({ snap }: { snap: SiteMonitor }) {
  return (
    <article className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">Origin</p>
          <h3 className="mt-1 text-lg font-semibold">{snap.name || snap.domain}</h3>
          <a
            href={snap.url || `https://${snap.domain}`}
            target="_blank"
            rel="noreferrer"
            className="mono mt-1 block break-all text-sm text-[#e2c36d] underline"
          >
            {snap.url || `https://${snap.domain}`}
          </a>
          <p className="mt-1 text-sm text-[#cfc8e8]">{snap.drift ? "Drift" : "In balance"}</p>
        </div>
        <div className="flex gap-2">
          <Pill tone={snap.catalogListed ? "good" : "warn"}>
            {snap.catalogListed ? "listed" : "unlisted"}
          </Pill>
          <Pill tone={snap.blockedByKill ? "bad" : "neutral"}>
            {snap.blockedByKill ? "acts frozen" : "acts open"}
          </Pill>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#9b95b3]">
        {snap.probes.length} probes · sitemap {snap.sitemapUrlCount} urls ·{" "}
        {snap.llms ? "llms.txt" : "no llms.txt"} · {snap.wellKnown ? "well-known" : "no well-known"}{" "}
        · {new Date(snap.at).toLocaleString()}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {snap.probes.map((p) => (
          <div
            key={p.path}
            className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-white/8 px-3 py-2 text-sm"
          >
            {/* min-w-0 is required for truncate to work in a flex row: a flex
                item will not shrink below its content without it, so the URL
                pushed the status pill off a 320px screen instead of ellipsing. */}
            <span className="mono min-w-0 truncate text-xs" title={p.url}>
              {p.url || p.path}
            </span>
            <span className="shrink-0">
              <Pill tone={p.kind === "ok" ? "good" : p.kind === "payment402" ? "gold" : "bad"}>
                {p.kind === "ok" ? String(p.status) : p.kind}
              </Pill>
            </span>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {snap.checks.map((c) => (
          <li key={c.id} className="rounded-2xl border border-white/8 px-3 py-2">
            <div className="flex items-center gap-2">
              <Pill tone={checkTone(c)}>{c.ok ? "pass" : c.severity}</Pill>
              <span className="text-sm font-medium">{c.title}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#b7b0cc]">{c.detail}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function ControlPlaneView() {
  const fleet = useFleet();
  if (fleet.loading) return <p className="text-[#9b95b3]">Loading control plane…</p>;
  if (!fleet.store) {
    return <p className="text-rose-300">{fleet.error || "Workspace unavailable"}</p>;
  }
  const { control, workspace, sites } = fleet.store;
  const kill = control.kill;
  const snaps = Object.values(control.snapshots);
  const platform = control.platform;

  return (
    <div className="space-y-8">
      {fleet.error && (
        <div className="glass rounded-2xl px-4 py-3 text-sm text-rose-300">{fleet.error}</div>
      )}

      <section className="glass rounded-3xl p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
          Origins this page is watching
        </p>
        <p className="mt-1 text-sm text-[#b7b0cc]">
          Every probe, snapshot, and reconcile check belongs to one of these URLs — not to the
          CiteFleet / BotCentral platform cards below.
        </p>
        <ul className="mt-4 space-y-3">
          {sites.map((site) => {
            const snap = control.snapshots[site.id];
            return (
              <li
                key={site.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{site.name}</p>
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono block truncate text-sm text-[#e2c36d] underline"
                  >
                    {site.url}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={snap ? (snap.drift ? "warn" : "good") : "neutral"}>
                    {snap ? (snap.drift ? "drift" : "probed") : "not probed"}
                  </Pill>
                  <Link
                    to="/sites/$id"
                    params={{ id: site.id }}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs hover:bg-white/5"
                  >
                    Campaign
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        {sites.length === 0 && (
          <p className="mt-3 text-sm text-[#9b95b3]">
            No origins onboarded. Paste the URL on Command first.
          </p>
        )}
      </section>

      <section className="glass rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">Kill switch</p>
            <h2 className="mt-1 text-2xl font-semibold">
              {kill.global ? "All acts frozen" : "Acts allowed"}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[#b7b0cc]">
              Observe (audit, monitor, reconcile) always runs. Act (publish, mentions, spend,
              autopilot) stops when a switch is on. This is the maker–checker freeze.
            </p>
          </div>
          <button
            className={`rounded-full px-5 py-2 text-sm font-semibold ${
              kill.global ? "bg-rose-300 text-[#07060f]" : "bg-white text-[#07060f]"
            }`}
            disabled={!!fleet.busy}
            onClick={() =>
              fleet.setKill({
                global: !kill.global,
                reason: kill.global ? "" : "Operator freeze from Monitor",
              })
            }
          >
            {kill.global ? "Thaw all acts" : "Freeze all acts"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {DOORS.map((d) => (
            <button
              key={d.id}
              disabled={!!fleet.busy}
              onClick={() =>
                fleet.setKill({
                  door: d.id,
                  frozen: !kill.doors[d.id],
                  reason: !kill.doors[d.id] ? `${d.id} frozen` : "",
                })
              }
              className="rounded-2xl border border-white/10 px-3 py-3 text-left hover:bg-white/5"
            >
              <Pill tone={kill.doors[d.id] || kill.global ? "bad" : "good"}>
                {kill.doors[d.id] || kill.global ? "frozen" : "open"}
              </Pill>
              <p className="mt-2 text-sm font-medium">{d.label}</p>
              <p className="text-xs text-[#9b95b3]">{d.hint}</p>
            </button>
          ))}
        </div>
        {kill.setAt && (
          <p className="mt-3 text-xs text-[#9b95b3]">
            Last change {new Date(kill.setAt).toLocaleString()} by {kill.setBy}
            {kill.reason ? ` — ${kill.reason}` : ""}
          </p>
        )}
      </section>

      <section className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">Control cycle</p>
          <p className="mt-1 text-sm text-[#cfc8e8]">
            Probe origins, classify 200 / 404 / 402, diff sitemap vs card vs ticks, ping both
            platforms. Last cycle{" "}
            {control.lastCycleAt ? new Date(control.lastCycleAt).toLocaleString() : "never"}.
          </p>
          <p className="mt-1 text-xs text-[#9b95b3]">
            Autopilot {workspace.autopilot ? "on" : "off"} — freeze autopilot if Sentinel should
            only watch.
          </p>
        </div>
        <button
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07060f]"
          disabled={!!fleet.busy}
          onClick={() => fleet.runControlCycle()}
        >
          {fleet.busy === "control" ? "Cycling…" : "Run monitor + reconcile"}
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Kpi
          label="This console · citefleet.app"
          ok={platform?.citefleet.ok}
          value={platform ? String(platform.citefleet.status) : "—"}
        />
        <Kpi
          label="Catalog host · botcentral.org"
          ok={platform?.botcentral.ok}
          value={platform ? String(platform.botcentral.status) : "—"}
        />
        <Kpi
          label="Catalog search API"
          ok={platform?.catalogSearch.ok}
          value={platform ? String(platform.catalogSearch.status) : "—"}
        />
      </section>

      {snaps.length === 0 ? (
        <p className="text-sm text-[#9b95b3]">
          No snapshots yet. Run the control cycle to populate probes and the ten checks.
        </p>
      ) : (
        <div className="space-y-4">
          {snaps.map((s) => (
            <Snapshot key={s.siteId} snap={s} />
          ))}
        </div>
      )}

      {control.jobs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Job log</h2>
          <ul className="space-y-2">
            {control.jobs.slice(0, 12).map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/8 px-4 py-2 text-sm"
              >
                <Pill tone={j.ok ? "good" : "bad"}>{j.kind}</Pill>
                <span className="text-[#cfc8e8]">{j.summary}</span>
                <span className="ml-auto mono text-[11px] text-[#9b95b3]">
                  {new Date(j.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-[#9b95b3]">
        <Link to="/" className="underline">
          Command
        </Link>{" "}
        stays the boarding desk. This page is watch, prove, freeze.
      </p>
    </div>
  );
}

function Kpi({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="glass rounded-3xl p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <Pill tone={ok === undefined ? "neutral" : ok ? "good" : "bad"}>
        {ok === undefined ? "not probed" : ok ? "healthy" : "down"}
      </Pill>
    </div>
  );
}
