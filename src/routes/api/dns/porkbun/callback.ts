import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/dns/porkbun/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishPorkbunDnsAuthorization } =
          await import("@/lib/citefleet/porkbun-dns-oauth.server.ts");
        return finishPorkbunDnsAuthorization(request);
      },
    },
  },
});
