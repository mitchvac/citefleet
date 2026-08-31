import { useFleet } from "@/lib/citefleet/client";
import { Pill } from "./Shell";

export function FleetView() {
  const fleet = useFleet();
  if (fleet.loading || !fleet.store) return <p className="text-[#9b95b3]">Loading fleet…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {fleet.store.bots.map((bot) => {
        const task = fleet.store!.tasks.find((t) => t.id === bot.currentTaskId);
        const site = fleet.store!.sites.find((s) => s.id === bot.currentSiteId);
        return (
          <article key={bot.id} className="glass rounded-3xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="mono text-xs tracking-[0.2em] text-[#e2c36d]">{bot.callsign}</p>
              <Pill
                tone={
                  bot.status === "working"
                    ? "violet"
                    : bot.status === "assigned"
                      ? "gold"
                      : "neutral"
                }
              >
                {bot.status}
              </Pill>
            </div>
            <h2 className="text-xl font-semibold">{bot.name}</h2>
            <p className="mt-1 text-sm text-[#b7b0cc]">{bot.role}</p>
            <p className="mt-3 text-sm text-[#cfc8e8]">{bot.specialty}</p>
            <p className="mt-4 text-xs uppercase tracking-wide text-[#9b95b3]">Owns</p>
            <p className="text-sm">{bot.playbookIds.join(" · ")}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-[#9b95b3]">Engines</p>
            <p className="text-sm">{bot.engines.join(" · ")}</p>
            {task && (
              <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3 text-sm">
                <p className="text-[11px] uppercase tracking-wide text-[#9b95b3]">
                  Assigned task
                </p>
                <p className="mt-1 font-medium">{task.title}</p>
                {site && <p className="text-[#9b95b3]">{site.domain}</p>}
                <button
                  className="mt-3 rounded-full border border-white/10 px-3 py-1 text-xs"
                  onClick={() => fleet.runTask(task.id)}
                  disabled={!!fleet.busy}
                >
                  Run {bot.callsign}
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
