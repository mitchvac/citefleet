import { createFileRoute } from "@tanstack/react-router";
import { getStore } from "@/lib/citefleet/store";
import { publisherReady } from "@/lib/citefleet/botcentral";
import { dbSource } from "@/lib/db";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        const store = await getStore();
        const publisher = publisherReady();
        const listed = store.sites.filter((s) => s.botcentral?.listed).length;
        return Response.json({
          ok: true,
          service: "citefleet",
          time: new Date().toISOString(),
          sites: store.sites.length,
          listed,
          publisher,
          db: dbSource === "pglite" ? "pglite" : "postgres",
        });
      },
    },
  },
});
