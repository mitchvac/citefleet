import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: "citefleet",
          time: new Date().toISOString(),
        }),
    },
  },
});
