import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/hosting/vercel/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishVercelInstall } = await import("@/lib/citefleet/vercel-install.server.ts");
        return finishVercelInstall(request);
      },
    },
  },
});
