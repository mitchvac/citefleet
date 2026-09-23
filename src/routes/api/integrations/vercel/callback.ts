import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/integrations/vercel/callback")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/lib/citefleet/vercel-origin-flow.server.ts")).originCallback(request),
    },
  },
});
