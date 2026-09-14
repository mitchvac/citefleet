import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dns/cloudflare/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishCloudflareDnsOAuth } = await import("@/lib/citefleet/dns-oauth.server.ts");
        return finishCloudflareDnsOAuth(request);
      },
    },
  },
});
