import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/github-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishOAuth } = await import("@/lib/auth/oauth.server");
        return finishOAuth("github", request);
      },
    },
  },
});
