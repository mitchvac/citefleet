import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dns/vercel/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishVercelDnsOAuth } = await import("@/lib/citefleet/vercel-dns-oauth.server.ts");
        return finishVercelDnsOAuth(request);
      },
    },
  },
});
