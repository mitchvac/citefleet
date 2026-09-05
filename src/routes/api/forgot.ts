import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/forgot")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 303, headers: { Location: "/login" } }),
      POST: async ({ request }) => {
        const { handleForgot } = await import("@/lib/auth/reset.server");
        return handleForgot(request);
      },
    },
  },
});
