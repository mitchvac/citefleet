import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/hosting/vercel/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { startVercelInstall } = await import("@/lib/citefleet/vercel-install.server.ts");
        return startVercelInstall(request);
      },
    },
  },
});
