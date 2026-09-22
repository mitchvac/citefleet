import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hosting/hostinger/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startHostingerInstall } = await import("@/lib/citefleet/hostinger-install.server.ts");
        return startHostingerInstall(request);
      },
    },
  },
});
