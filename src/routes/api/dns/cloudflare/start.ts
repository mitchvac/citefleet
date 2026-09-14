import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dns/cloudflare/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startCloudflareDnsOAuth } = await import("@/lib/citefleet/dns-oauth.server.ts");
        return startCloudflareDnsOAuth(request);
      },
    },
  },
});
