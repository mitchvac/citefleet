import { useState } from "react";
import { packFiles } from "@/lib/citefleet/originPack";
import { providerGuidance } from "@/lib/citefleet/provider-choice";
import { PROVIDER_FLOWS } from "@/lib/citefleet/provider-flows";
import { Copy } from "./Copy";
import type { Site } from "@/lib/citefleet/types";
import type { useFleet } from "@/lib/citefleet/client";

/**
 * "The five files" — the panel that finally hands the customer the pack.
 *
 * Until this existed there was NO way to get the origin files out of CiteFleet
 * unless the property deployed from a GitHub repo we held a token for. Every
 * other customer — anyone on shared hosting, anyone using a File Manager — could
 * read that the files were required and had no means of obtaining them. That is
 * why a Copy and a Download sit on every row: hPanel, cPanel, Plesk and Site
 * Tools all offer both "create a file and paste" and "upload a file".
 *
 * The paths here are WEB-ROOT-relative (`robots.txt`), not repo-relative
 * (`public/robots.txt`), because the person reading them is standing in their
 * web root. `packFiles` and `buildOriginPack` generate identical bytes.
 */
function downloadName(path: string): string {
  // `.well-known/botcentral.txt` cannot survive a browser download — the
  // directory is stripped and a leading-dot name is hidden on most systems. Give
  // it a flat, visible name and tell the customer where it belongs.
  return path.replace(/^\.well-known\//, "well-known--");
}

function FileRow({ path, content }: { path: string; content: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <li className="rounded-2xl border border-white/10 bg-white/5 p-3" data-testid="origin-pack-file">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="mono min-w-0 truncate text-sm text-[#eee9ff]" title={path}>
          /{path}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Copy label={path} value={content} />
          <button
            type="button"
            onClick={() => {
              // A Blob + object URL — no dependency, and nothing leaves the
              // browser. Revoked immediately; the download has already started.
              const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = downloadName(path);
              a.click();
              URL.revokeObjectURL(url);
              setSaved(true);
              setTimeout(() => setSaved(false), 1800);
            }}
            className="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#cfc8e8] hover:bg-white/5"
          >
            {saved ? "Saved" : "Download"}
          </button>
        </span>
      </div>
      {path.startsWith(".well-known/") && (
        <p className="mt-2 text-xs text-[#9b95b3]">
          Goes in a folder named <span className="mono">.well-known</span> — the dot matters.
          Some file managers hide it until you turn on “show hidden files”.
        </p>
      )}
    </li>
  );
}

export function OriginPackPanel({
  site,
  fleet,
}: {
  site: Site;
  fleet: ReturnType<typeof useFleet>;
}) {
  const [open, setOpen] = useState(false);
  const files = packFiles(site);
  const guidance = site.provider ? providerGuidance(PROVIDER_FLOWS, site.provider) : null;
  // The pack is FIVE files. It is four only when this property has no IndexNow
  // key — every property onboarded before keys were generated. Say so plainly
  // and offer the one click that fixes it, rather than quietly listing four.
  const missingKey = !site.indexNowKey;
  return (
    <section className="glass rounded-3xl p-5" data-testid="origin-pack-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#9b95b3]">
            The files bots read
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {files.length} of 5 files for {site.domain}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[#b7b0cc]">
            These paths are relative to your <strong>web root</strong> — the folder whose
            contents are served at{" "}
            <span className="mono">https://{site.domain}/</span>. Copy each one into
            your host’s file manager, or download and upload them. Deploying from
            GitHub instead? Use Push origin files above and skip this.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
          data-testid="origin-pack-toggle"
        >
          {open ? "Hide files" : "Show files"}
        </button>
      </div>

      {missingKey && (
        <div
          className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2"
          data-testid="origin-pack-missing-key"
        >
          <p className="min-w-0 flex-1 text-sm text-amber-100">
            This property has no IndexNow key, so the pack is four files. The key is
            a public verification string, not a secret — generating one adds the
            fifth file and lets Bing, Yandex and Seznam recrawl on deploy.
          </p>
          <button
            type="button"
            disabled={!!fleet.busy}
            onClick={() => void fleet.setIndexNowKey(site.id, "")}
            className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#cfc8e8] hover:bg-white/5 disabled:opacity-40"
          >
            {fleet.busy === "indexnow" ? "Generating…" : "Generate key"}
          </button>
        </div>
      )}

      {guidance && (
        <p className="mt-3 max-w-xl rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#b7b0cc]">
          <span className="text-[#cfc8e8]">{site.provider!.name}:</span> {guidance.detail}
        </p>
      )}

      {open && (
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <FileRow key={f.path} path={f.path} content={f.content} />
          ))}
        </ul>
      )}
    </section>
  );
}
