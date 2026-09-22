import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/hosting/vercel/advance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { advanceVercelInstall } = await import("@/lib/citefleet/vercel-install.server.ts");
        return advanceVercelInstall(request);
      },
    },
  },
});
