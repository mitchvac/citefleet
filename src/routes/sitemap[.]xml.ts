import { createFileRoute } from "@tanstack/react-router";

const PATHS = [
  "/",
  "/fleet",
  "/playbook",
  "/activity",
  "/learn",
  "/learn/glossary",
  "/learn/quiz",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = "https://citefleet.app";
        const body = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...PATHS.map((path) => `  <url><loc>${origin}${path}</loc></url>`),
          `</urlset>`,
          "",
        ].join("\n");
        return new Response(body, {
          headers: { "content-type": "application/xml; charset=utf-8" },
        });
      },
    },
  },
});
