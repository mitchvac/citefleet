import { createFileRoute } from "@tanstack/react-router";

// GitHub → CiteFleet. The signature is verified against the property's own
// secret; see src/lib/citefleet/webhook.ts and docs/customer-setup.md.
export const Route = createFileRoute("/api/hooks/github")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, hint: "Point a GitHub repository webhook (content type JSON, events: push, deployment_status) at this URL with the secret from your CiteFleet campaign page." },
          { status: 405 },
        ),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const { handleGithubWebhook, runWebhookListing, getStore } = await import("@/lib/citefleet/ops.server");
        const { mutateStore } = await import("@/lib/citefleet/store");
        const result = await handleGithubWebhook(
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
