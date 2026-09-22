import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hosting/hostinger/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { runHostingerInstall } = await import("@/lib/citefleet/hostinger-install.server.ts");
        return runHostingerInstall(request);
      },
    },
  },
});
