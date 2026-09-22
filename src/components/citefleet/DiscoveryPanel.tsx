import { useState } from "react";
import type { Site } from "@/lib/citefleet/types";
import type { useFleet } from "@/lib/citefleet/client";
import { parseDiscoveryRecord } from "@/lib/citefleet/discovery";
import { Copy } from "./Copy";

const INPUT =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white";

export function DiscoveryPanel({
  site,
  fleet,
}: {
  site: Site;
  fleet: ReturnType<typeof useFleet>;
}) {
  const saved = site.discovery?.record;
  const [name, setName] = useState(saved?.name ?? site.name);
  const [summary, setSummary] = useState(saved?.summary ?? "");
  const [topics, setTopics] = useState(saved?.topics.join(", ") ?? "");
  const [pages, setPages] = useState(saved?.pages.map((page) => page.url).join("\n") ?? "");
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const latest = site.discovery?.latest;
  const receipt = latest?.status === "accepted" ? latest.receipt : undefined;
  const busy = Boolean(fleet.busy);

  return (
    <section
      className="glass min-w-0 rounded-3xl p-5 md:p-6"
      aria-labelledby="discovery-heading"
      data-testid="discovery-panel"
    >
      <p className="text-xs uppercase tracking-[0.16em] text-[#9b95b3]">
        Website discovery → BotCentral
      </p>
      <h2 id="discovery-heading" className="mt-2 text-xl font-semibold">
        Publish your website through BotCentral
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-[#b7b0cc]">
        Use this option when your host cannot install the five files or you prefer to store them on
        BotCentral. Send a short website description, selected links, and the five generated files.
        Search results can point visitors to your original website. You can also install files on
        your website using the options below.
      </p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const record = parseDiscoveryRecord({
              name,
              url: site.url,
              summary,
              topics: topics
                .split(",")
                .map((topic) => topic.trim())
                .filter(Boolean),
              pages: pages
                .split("\n")
                .map((url) => url.trim())
                .filter(Boolean)
                .map((url) => ({
                  url,
                  title: new URL(url).pathname === "/" ? name : new URL(url).pathname,
                })),
            });
            await fleet.submitDiscovery(site.id, record);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Check your website information.");
          }
        }}
      >
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <label className="min-w-0 text-sm">
            Website name
            <input
              className={INPUT}
              value={name}
              maxLength={200}
              required
              onChange={(e) => setName(e.target.value)}
              title="The name displayed in your BotCentral discovery record."
            />
          </label>
          <label className="min-w-0 text-sm">
            Original website URL
            <input
              className={INPUT}
              value={site.url}
              readOnly
              title="This record points to this campaign’s website."
            />
          </label>
        </div>
        <label className="block text-sm">
          Website description
          <textarea
            className={INPUT}
            value={summary}
            maxLength={1200}
            rows={3}
            required
            onChange={(e) => setSummary(e.target.value)}
            title="Up to 1,200 characters describing your website or services."
          />
        </label>
        <label className="block text-sm">
          Topics or services (comma separated)
          <input
            className={INPUT}
            value={topics}
            onChange={(e) => setTopics(e.target.value)}
            title="Up to ten short topics. Include only services your website actually offers."
          />
        </label>
        <label className="block text-sm">
          Important page URLs (one per line, optional)
          <textarea
            className={INPUT}
            value={pages}
            rows={3}
            onChange={(e) => setPages(e.target.value)}
            title="Up to twenty public pages on this website. Only URLs and titles are stored."
          />
        </label>
        <p className="text-xs text-[#9b95b3]">
          Submitting approves publication of this information and the generated files on BotCentral.
          Keep private information out of this form.
        </p>
        <button
          disabled={busy}
          className="min-h-11 rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          title="Send the compact record and five files to BotCentral."
        >
          {fleet.busy === "discovery"
            ? "Sending to BotCentral…"
            : "Send website and 5 files to BotCentral"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {latest && (
        <div className="mt-4 min-w-0 rounded-xl border border-white/10 p-4 text-sm" role="status">
          <p>
            {latest.status === "accepted"
              ? "BotCentral confirmed receipt of your discovery record and five files."
              : latest.status === "pending"
                ? "Submission saved. BotCentral receipt has not been confirmed; you can retry."
                : "BotCentral has not confirmed receipt."}
          </p>
          {latest.error && <p className="mt-2 text-rose-300">{latest.error}</p>}
          {receipt && (
            <>
              <a
                className="mt-2 block break-all text-sky-300 underline"
                href={receipt.url}
                target="_blank"
                rel="noreferrer"
              >
                Open BotCentral record
              </a>
              <ul className="mt-2 space-y-1">
                {receipt.files.map((file) => (
                  <li key={file.path}>
                    <a
                      className="break-all underline"
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.path}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-[#9b95b3]">
        A BotCentral receipt confirms storage. Website ownership, origin installation, and
        appearance in AI search are reported separately.
      </p>
      <details className="mt-5 border-t border-white/10 pt-4">
        <summary className="cursor-pointer text-sm font-medium">
          Option 2: let an AI application submit websites
        </summary>
        <p className="mt-3 max-w-3xl text-sm text-[#b7b0cc]">
          Connect an application using a submission key for this workspace. It can add or update
          compact records and send them to BotCentral. Creating a new key replaces the previous key.
        </p>
        <p className="mt-2 break-all text-xs text-[#9b95b3]">
          POST /api/discovery/submissions · Authorization: Bearer &lt;submission key&gt;
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="min-h-11 rounded-full border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setToken(null);
              setToken(await fleet.rotateDiscoveryKey());
            }}
          >
            Create or replace submission key
          </button>
          <button
            type="button"
            className="min-h-11 rounded-full border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              if (await fleet.revokeDiscoveryKey()) setToken(null);
            }}
          >
            Revoke submission key
          </button>
        </div>
        {token && (
          <div className="mt-3 min-w-0 rounded-xl border border-sky-400/30 p-3">
            <p className="text-xs text-[#b7b0cc]">
              Copy this key now. It is only shown here after creation.
            </p>
            <code className="my-2 block break-all text-xs" data-testid="discovery-key">
              {token}
            </code>
            <div className="flex flex-wrap gap-2">
              <Copy label="submission key" value={token} size="control" />
              <button className="min-h-11 px-3 text-sm underline" onClick={() => setToken(null)}>
                Hide key
              </button>
            </div>
          </div>
        )}
      </details>
    </section>
  );
}
