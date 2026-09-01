import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";
import { ControlPlaneView } from "@/components/citefleet/ControlPlane";

export const Route = createFileRoute("/ops")({ component: OpsPage });

function OpsPage() {
  return (
    <Shell eyebrow="Control plane" title="Monitor · Reconcile · Kill">
      <p className="-mt-6 mb-8 max-w-2xl text-sm leading-6 text-[#b7b0cc]">
        Ten checks per origin. Freeze acts without stopping observe. Ticks without
        a proof URL fail reconcile.
      </p>
      <ControlPlaneView />
    </Shell>
  );
}
