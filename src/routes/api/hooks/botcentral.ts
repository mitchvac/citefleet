import { createFileRoute } from "@tanstack/react-router";

// BotCentral → CiteFleet. Signed with the shared service token (or
// BOTCENTRAL_WEBHOOK_SECRET when both sides set one); see
// src/lib/citefleet/webhook.ts `handleBotcentralWebhook`. Configured on
// BotCentral as BOTCENTRAL_PUBLISHER_WEBHOOK=https://citefleet.app/api/hooks/botcentral.
export const Route = createFileRoute("/api/hooks/botcentral")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, hint: "BotCentral posts site.listed / site.reverified / site.lapsed / site.unpublished here, signed with x-botcentral-signature." },
          { status: 405 },
        ),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleBotcentralWebhook, applyCatalogState } = await import("@/lib/citefleet/ops.server");
        const { hookDeps } = await import("@/lib/citefleet/hook-tenant.server.ts");
        // BotCentral names the host its event is about; that host decides the
        // tenant. An unknown host resolves to an empty store, which is how the
        // handler already answers 202-ignore for a domain nobody listed here.
        let domain = "";
        try {
          const parsed = JSON.parse(rawBody) as { domain?: unknown };
          if (typeof parsed.domain === "string") domain = parsed.domain;
        } catch {
          /* the handler answers 400 for a body that is not JSON */
        }
        const tenant = await hookDeps({ domain });
        const result = await handleBotcentralWebhook(
          { rawBody, header: (name) => request.headers.get(name) },
          {
            getStore: tenant.getStore,
            mutateStore: tenant.mutateStore,
            apply: applyCatalogState,
            catalogUrl: process.env.BOTCENTRAL_URL || "https://botcentral.org",
          },
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
