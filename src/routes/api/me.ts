import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/me")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { currentSessionUser } = await import("@/lib/auth/operator.server");
        return Response.json(currentSessionUser(request), {
          // Per-session, and it changes on sign-out. Never cache it.
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
