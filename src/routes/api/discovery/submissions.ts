import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/discovery/submissions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleDiscoverySubmission } = await import("@/lib/citefleet/discovery.server.ts");
        return handleDiscoverySubmission(request);
      },
    },
  },
});
