import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleLogout } = await import("@/lib/auth/operator.server");
        return handleLogout(request);
      },
      POST: async ({ request }) => {
        const { handleLogout } = await import("@/lib/auth/operator.server");
        return handleLogout(request);
      },
    },
  },
});
