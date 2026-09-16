import { createFileRoute } from "@tanstack/react-router";
import { CampaignView } from "@/components/citefleet/CampaignView";
import { Shell } from "@/components/citefleet/Shell";

type GithubResult = "installed" | "current" | "failed" | "denied" | "unavailable";

const githubResult = (value: unknown): GithubResult | undefined =>
  value === "installed" ||
  value === "current" ||
  value === "failed" ||
  value === "denied" ||
  value === "unavailable"
    ? value
    : undefined;

export const Route = createFileRoute("/sites/$id")({
  validateSearch: (search: Record<string, unknown>): { github?: GithubResult } => ({
    github: githubResult(search.github),
  }),
  component: SitePage,
});

function SitePage() {
  const { id } = Route.useParams();
  const { github } = Route.useSearch();
  return (
    <Shell>
      <CampaignView siteId={id} githubResult={github} />
    </Shell>
  );
}
