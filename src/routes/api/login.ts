import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      GET: async () => new Response(null, { status: 303, headers: { Location: "/login" } }),
      POST: async ({ request }) => {
        const { handleLogin } = await import("@/lib/auth/operator.server");
        return handleLogin(request);
      },
    },
  },
});
