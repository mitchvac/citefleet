import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/reset")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 303, headers: { Location: "/login" } }),
      POST: async ({ request }) => {
        const { handleReset } = await import("@/lib/auth/reset.server");
        return handleReset(request);
      },
    },
  },
});
