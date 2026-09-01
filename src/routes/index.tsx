import { createFileRoute } from "@tanstack/react-router";
import { CommandBoard } from "@/components/citefleet/CommandBoard";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Shell
      eyebrow="CiteFleet · Command center"
      title="Get every customer site indexed — and cited."
    >
      <p className="-mt-6 mb-8 max-w-2xl text-sm leading-6 text-[#b7b0cc]">
        CiteFleet assigns each specialist bot a concrete door: Google, Bing,
        IndexNow, X/Grok, directories, and press. Technical foundation first,
        then mentions so AI assistants can cite the domain.
      </p>
      <CommandBoard />
    </Shell>
  );
}
