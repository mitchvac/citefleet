import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dns/porkbun/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startPorkbunDnsAuthorization } =
          await import("@/lib/citefleet/porkbun-dns-oauth.server.ts");
        return startPorkbunDnsAuthorization(request);
      },
    },
  },
});
