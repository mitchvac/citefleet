import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      // GET only shows the sign-in page: a cross-site link must not be able to
      // sign the operator out (the Lax cookie rides on top-level navigations).
      GET: async () => new Response(null, { status: 303, headers: { Location: "/login" } }),
      POST: async ({ request }) => {
        const { handleLogout } = await import("@/lib/auth/operator.server");
        return handleLogout(request);
      },
    },
  },
});
