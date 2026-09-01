import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/citefleet/store";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const store = await getStore();
        return Response.json({
          ok: true,
          service: "citefleet",
          time: new Date().toISOString(),
          sites: store.sites.length,
          db: "postgres",
        });
      },
    },
  },
});
