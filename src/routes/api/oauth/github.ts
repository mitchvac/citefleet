import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/github")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startOAuth } = await import("@/lib/auth/oauth.server");
        return startOAuth("github", request);
      },
    },
  },
});
