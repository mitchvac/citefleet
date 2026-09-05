import { createFileRoute } from "@tanstack/react-router";

/**
 * NOTE: this route is SHADOWED in production. `public/llms.txt` is served as a
 * static asset and wins, so what bots actually read is that file — which
 * CiteFleet's own origin pack writes. Verified 2026-09-05 by fetching
 * https://citefleet.app/llms.txt and getting the static file's body, not this
 * one. Keep the two in step until one of them is retired.
 */
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () => {
        const body = `# CiteFleet

> CiteFleet is the ops console that lists websites in BotCentral.

## Find the web before you crawl it.

BotCentral is an owner-proven discovery registry for AI agents. Search verified
websites, understand retrieval/training/action consent, and discover
machine-readable resources before crawling the open web.

Specification: draft-mitchell-botcentral-card-00 (IETF Internet-Draft).

- [Command](https://citefleet.app/): onboard an origin, audit, dispatch
- [Playbook](https://citefleet.app/playbook): Google, Bing, IndexNow, Grok, ChatGPT, BotCentral
- [BotCentral catalog](https://botcentral.org/): public 1.0 cards assistants read
- [Get listed](https://botcentral.org/docs/listing): CiteFleet publishes; bots do not

CiteFleet never lets bots publish. After a live audit, Orion POSTs a BotCentral 1.0 card to https://botcentral.org/internal/publish.
`;
        return new Response(body, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
