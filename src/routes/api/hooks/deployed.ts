import { createFileRoute } from "@tanstack/react-router";

// Any CI/host → CiteFleet after a successful deploy. Body {"domain": "..."},
// header X-CiteFleet-Signature: sha256=HMAC-SHA256(body, property secret).
export const Route = createFileRoute("/api/hooks/deployed")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, hint: 'POST {"domain":"<your-domain>"} with X-CiteFleet-Signature: sha256=<HMAC-SHA256 of the body using your CiteFleet webhook secret>.' },
          { status: 405 },
        ),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleDeployedHook, runWebhookListing, getStore } = await import("@/lib/citefleet/ops.server");
        const { mutateStore } = await import("@/lib/citefleet/store");
        const result = await handleDeployedHook(
          { rawBody, header: (name) => request.headers.get(name) },
          {
            getStore,
            mutateStore,
            onCheck: (siteId, reason) => {
              void runWebhookListing(siteId, reason);
            },
          },
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
