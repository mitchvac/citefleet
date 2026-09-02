import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/providers")({
  server: {
    handlers: {
      GET: async () => {
        const { oauthConfigured } = await import("@/lib/auth/oauth.server");
        return Response.json(oauthConfigured());
      },
    },
  },
});
