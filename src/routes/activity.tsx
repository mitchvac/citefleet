import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";
import { useFleet } from "@/lib/citefleet/client";

export const Route = createFileRoute("/activity")({ component: ActivityPage });

function ActivityPage() {
  const fleet = useFleet();
  return (
    <Shell eyebrow="Immutable ops trail" title="Audit log">
      {!fleet.store ? (
        <p className="text-[#9b95b3]">Loading events…</p>
      ) : (
        <ol className="glass space-y-0 divide-y divide-white/8 rounded-3xl px-4 sm:px-5">
          {fleet.store.activity.map((event) => (
            <li
              key={event.id}
              className="grid min-w-0 gap-2 py-4 md:grid-cols-[180px_140px_minmax(0,1fr)]"
            >
              <span className="mono min-w-0 break-words text-[11px] text-[#9b95b3]">
                {new Date(event.at).toLocaleString()}
              </span>
              <span className="min-w-0 break-words text-sm text-[#e2c36d]">{event.actor}</span>
              <span className="min-w-0 break-words text-sm text-[#e8e4f6]">{event.message}</span>
            </li>
          ))}
        </ol>
      )}
    </Shell>
  );
}
