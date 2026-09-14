import { createFileRoute } from "@tanstack/react-router";

// Entri Connect -> CiteFleet. Entri signs the raw body with its V3 HMAC; a
// propagation-success event starts CiteFleet's independent proof check.
export const Route = createFileRoute("/api/hooks/entri")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, hint: "Entri Connect posts signed DNS propagation events here." },
          { status: 405 },
        ),
      POST: async ({ request }) => {
        const { readWebhookBody } = await import("@/lib/citefleet/webhook-body.server.ts");
        const body = await readWebhookBody(request);
        if (!body.ok)
          return Response.json({ ok: false, error: body.error }, { status: body.status });
        const { rawBody } = body;
        const { entriHookSecret, handleEntriWebhook, runWebhookListing } =
          await import("@/lib/citefleet/ops.server");
        const { hookDeps } = await import("@/lib/citefleet/hook-tenant.server.ts");
        const result = await handleEntriWebhook(
          { rawBody, header: (name) => request.headers.get(name) },
          {
            secret: entriHookSecret(),
            resolveTarget: (domain, jobId) =>
              hookDeps({ domain, dnsSetupJobId: jobId }, (ws, siteId, reason, context) => {
                if (!context) throw new Error("Entri proof context is missing.");
                // A prior failed proof can leave a five-minute negative DNS cache.
                // Check beyond that boundary before declaring the provider write failed.
                void runWebhookListing(ws, siteId, reason, {
                  attempts: 12,
                  delayMs: 30_000,
                  dnsSetupOperationId: context.jobId,
                  inFlightKey: context.inFlightKey,
                });
              }),
          },
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
