import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/hosting/vercel/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getVercelInstallStatus } = await import("@/lib/citefleet/vercel-install.server.ts");
        return getVercelInstallStatus(request);
      },
    },
  },
});
