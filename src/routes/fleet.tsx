import { createFileRoute } from "@tanstack/react-router";
import { FleetView } from "@/components/citefleet/FleetView";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/fleet")({ component: FleetPage });

function FleetPage() {
  return (
    <Shell eyebrow="Nine specialist agents" title="Grok fleet roster">
      <p className="-mt-6 mb-8 max-w-2xl text-sm text-[#b7b0cc]">
        One bot per lever. The dispatcher never leaves Google, Bing, Grok, or
        ChatGPT-class engines without an owner.
      </p>
      <FleetView />
    </Shell>
  );
}
