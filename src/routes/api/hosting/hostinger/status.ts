import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hosting/hostinger/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { hostingerInstallStatus } = await import("@/lib/citefleet/hostinger-install.server.ts");
        return hostingerInstallStatus(request);
      },
    },
  },
});
