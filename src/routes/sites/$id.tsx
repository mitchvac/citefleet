import { createFileRoute } from "@tanstack/react-router";
import { CampaignView } from "@/components/citefleet/CampaignView";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/sites/$id")({ component: SitePage });

function SitePage() {
  const { id } = Route.useParams();
  return (
    <Shell>
      <CampaignView siteId={id} />
    </Shell>
  );
}
