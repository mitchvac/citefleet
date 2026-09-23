import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/integrations/vercel")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/lib/citefleet/vercel-origin-flow.server.ts")).originSetup(request),
      POST: async ({ request }) =>
        (await import("@/lib/citefleet/vercel-origin-flow.server.ts")).originSetup(request),
    },
  },
});
