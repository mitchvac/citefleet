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
        const { handleGithubWebhook, runWebhookListing } = await import("@/lib/citefleet/ops.server");
        const { repoFullName } = await import("@/lib/citefleet/webhook.ts");
        const { hookDeps } = await import("@/lib/citefleet/hook-tenant.server.ts");
        // Which tenant owns this repo, found by searching — never defaulted.
        let repo = "";
        try {
          repo = repoFullName(JSON.parse(rawBody) as Record<string, unknown>);
        } catch {
          /* a body that is not JSON falls through to the handler's own 400 */
        }
        const deps = await hookDeps({ repo }, (ws, siteId, reason) => {
          void runWebhookListing(ws, siteId, reason);
        });
        const result = await handleGithubWebhook(
          { rawBody, header: (name) => request.headers.get(name) },
          deps,
        );
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
