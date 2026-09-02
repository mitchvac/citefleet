import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/signup")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 303, headers: { Location: "/login" } }),
      POST: async ({ request }) => {
        const { handleSignup } = await import("@/lib/auth/operator.server");
        return handleSignup(request);
      },
    },
  },
});
