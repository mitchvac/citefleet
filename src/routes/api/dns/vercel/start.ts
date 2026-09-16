import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dns/vercel/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startVercelDnsOAuth } = await import("@/lib/citefleet/vercel-dns-oauth.server.ts");
        return startVercelDnsOAuth(request);
      },
    },
  },
});
