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
        const { handleDeployedHook, runWebhookListing } = await import("@/lib/citefleet/ops.server");
        const { hookDeps } = await import("@/lib/citefleet/hook-tenant.server.ts");
        // The tenant is found from the domain in the body, never defaulted. An
        // unknown domain yields an empty store, so the handler burns the decoy
        // secret and answers 401 exactly as it does for an unattached domain —
        // response timing must not reveal whether a domain is known.
        let domain = "";
        try {
          const parsed = JSON.parse(rawBody) as { domain?: unknown };
          if (typeof parsed.domain === "string") domain = parsed.domain;
        } catch {
          /* handleDeployedHook answers 400 for a body that is not JSON */
        }
        const deps = await hookDeps({ domain }, (ws, siteId, reason) => {
          void runWebhookListing(ws, siteId, reason);
        });
        const result = await handleDeployedHook(
          { rawBody, header: (name) => request.headers.get(name) },
          deps,
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
