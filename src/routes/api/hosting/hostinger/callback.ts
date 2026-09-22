import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hosting/hostinger/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishHostingerInstall } = await import("@/lib/citefleet/hostinger-install.server.ts");
        return finishHostingerInstall(request);
      },
    },
  },
});
