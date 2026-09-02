import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/oauth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { startOAuth } = await import("@/lib/auth/oauth.server");
        return startOAuth("google", request);
      },
    },
  },
});
