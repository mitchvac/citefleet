import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";
import { ControlPlaneView } from "@/components/citefleet/ControlPlane";

export const Route = createFileRoute("/ops")({ component: OpsPage });

function OpsPage() {
  return (
    <Shell eyebrow="Control plane" title="Monitor · Reconcile · Kill">
      <p className="-mt-6 mb-8 max-w-2xl text-sm leading-6 text-[#b7b0cc]">
        This page is per origin URL. The list at the top is the customer site
        (e.g. https://resonanse.app). The three platform cards are citefleet.app
        and botcentral.org — not the customer.
      </p>
      <ControlPlaneView />
    </Shell>
  );
}
