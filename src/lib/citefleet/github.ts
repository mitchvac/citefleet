import type { StoreShape } from "./types";
import { buildOriginPack, originRoot } from "./originPack.ts";
import {
  frameworkSourceDirs,
  planOriginPack,
  shadowedOriginFile,
} from "./origin-ownership.ts";
import { siteVerifyToken } from "./verify-token.ts";
import { maskStoreSecrets } from "./secrets.ts";
import { assertCanAct } from "./control.ts";
import { getStore, logActivity, mutateStore } from "./store.ts";
import {
  normalizeOwner,
  normalizeRepo,
  normalizeRoot,
  originRepoConflict,
} from "./origin-repo.ts";

const API = "https://api.github.com";

export function githubConfigured(store?: StoreShape) {
  const env = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
  if (env && env.length > 8) return true;
  return Boolean(store?.workspace.githubToken && store.workspace.githubToken.length > 8);
}

function tokenFrom(store: StoreShape) {
  return (
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    store.workspace.githubToken?.trim() ||
    ""
  );
}

async function gh(
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CiteFleetOriginPack/1.0",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text.slice(0, 400) };
  }
  return { ok: res.ok, status: res.status, json };
}

async function putFile(
  token: string,
  repo: { owner: string; repo: string; branch: string },
  path: string,
  content: string,
  message: string,
) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const existing = await gh(
    token,
    `/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.branch)}`,
  );
  const sha =
    existing.ok && existing.json && typeof existing.json === "object"
      ? (existing.json as { sha?: string }).sha
      : undefined;
  const body: Record<string, unknown> = {
    message,
    content: encoded,
    branch: repo.branch,
  };
  if (sha) body.sha = sha;
  const put = await gh(
    token,
    `/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(path)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
  if (!put.ok) {
    const msg =
      put.json && typeof put.json === "object" && "message" in put.json
        ? String((put.json as { message: string }).message)
        : `GitHub ${put.status}`;
    throw new Error(`${path}: ${msg}`);
  }
  const commit =
    put.json && typeof put.json === "object"
      ? (put.json as { commit?: { sha?: string; html_url?: string } }).commit
      : undefined;
  return { path, sha: commit?.sha, url: commit?.html_url };
}

/**
 * Read one path from the repo.
 *
 * The three outcomes are kept apart on purpose. A read that FAILED is not
 * "absent": treating a 403 or a rate-limit as an empty path is how a guard
 * ends up authorising the overwrite it exists to prevent. Only a 404 means
 * nothing is there.
 */
async function readFileContent(
  token: string,
  repo: { owner: string; repo: string; branch: string },
  path: string,
): Promise<
  { ok: true; content: string | null } | { ok: false; message: string }
> {
  const res = await gh(
    token,
    `/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.branch)}`,
  );
  if (res.status === 404) return { ok: true, content: null };
  if (!res.ok) {
    const msg =
      res.json && typeof res.json === "object" && "message" in res.json
        ? String((res.json as { message: string }).message)
        : `GitHub ${res.status}`;
    return { ok: false, message: `${path}: ${msg}` };
  }
  const body = res.json as { content?: string; encoding?: string } | null;
  if (!body || body.encoding !== "base64" || typeof body.content !== "string") {
    // A file over GitHub's inline limit answers `encoding: "none"` with empty
    // content. Unreadable is unreadable — fail closed rather than call it empty.
    return { ok: false, message: `${path}: unreadable (encoding ${body?.encoding ?? "none"})` };
  }
  return {
    ok: true,
    content: Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8"),
  };
}

/**
 * Find framework sources that already serve /robots.txt or /sitemap.xml.
 *
 * One directory listing per candidate layout rather than a HEAD per extension:
 * four requests instead of forty, and it sees any extension the framework
 * accepts. A directory that 404s is simply not that layout; any OTHER failure
 * is surfaced, because "could not look" must not read as "nothing there".
 */
async function detectFrameworkRoutes(
  token: string,
  repo: { owner: string; repo: string; branch: string },
  root: string,
): Promise<{ routes: Map<string, string>; unreadable: string[] }> {
  const routes = new Map<string, string>();
  const unreadable: string[] = [];
  for (const dir of frameworkSourceDirs(root)) {
    const res = await gh(
      token,
      `/repos/${repo.owner}/${repo.repo}/contents/${encodeURI(dir)}?ref=${encodeURIComponent(repo.branch)}`,
    );
    if (res.status === 404) continue;
    if (!res.ok || !Array.isArray(res.json)) {
      unreadable.push(dir);
      continue;
    }
    for (const entry of res.json as Array<{ name?: string; type?: string }>) {
      if (entry.type !== "file" || !entry.name) continue;
      const shadows = shadowedOriginFile(entry.name);
      // First layout wins; app/ is listed before pages/ so the modern one is
      // the one named in the refusal.
      if (shadows && !routes.has(shadows)) routes.set(shadows, `${dir}/${entry.name}`);
    }
  }
  return { routes, unreadable };
}

/**
 * What a push would do to this property's repo, without doing any of it.
 *
 * Reads every target path plus the framework layouts, then hands both to the
 * one rule in `origin-ownership.ts`. `pushOriginPack` calls this and writes
 * only what it returns as writable, so the campaign panel and the server can
 * never disagree about what is about to happen.
 */
export async function inspectOriginPack(siteId: string) {
  const store = await getStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) throw new Error("Site not found");
  if (!site.github?.owner || !site.github.repo) {
    throw new Error("Attach a GitHub repo on this property first (owner / repo).");
  }
  const conflict = originRepoConflict(site, site.github, store.sites);
  if (conflict) throw new Error(conflict.message);
  const token = tokenFrom(store);
  if (!token) {
    throw new Error(
      "No GitHub token. Paste a classic PAT with repo scope on Command, or set GITHUB_TOKEN on the server.",
    );
  }

  const repo = {
    owner: site.github.owner,
    repo: site.github.repo,
    branch: site.github.branch,
  };
  const files = buildOriginPack({ ...site, verifyToken: siteVerifyToken(site) });

  const remotes = new Map<string, string | null>();
  const unreadable: string[] = [];
  for (const file of files) {
    const read = await readFileContent(token, repo, file.path);
    if (read.ok) remotes.set(file.path, read.content);
    else unreadable.push(read.message);
  }
  const framework = await detectFrameworkRoutes(token, repo, originRoot(site));

  const plan = planOriginPack(files, remotes, framework.routes);
  return {
    repo: `${repo.owner}/${repo.repo}`,
    branch: repo.branch,
    root: originRoot(site),
    verdicts: plan.verdicts,
    writable: plan.writable,
    blocked: plan.blocked,
    noop: plan.noop,
    /** Paths the repo would not answer for. Push refuses while this is non-empty. */
    unreadable: [...unreadable, ...framework.unreadable.map((d) => `${d}/: unreadable`)],
  };
}

export async function attachGithub(
  siteId: string,
  input: { owner: string; repo: string; branch?: string; root?: string },
) {
  const owner = normalizeOwner(input.owner);
  const repo = normalizeRepo(input.repo);
  if (!owner || !repo) throw new Error("GitHub owner and repo are required");
  await mutateStore((store) => {
    const site = store.sites.find((s) => s.id === siteId);
    if (!site) throw new Error("Site not found");
    const conflict = originRepoConflict(site, { owner, repo, root: input.root }, store.sites);
    if (conflict) throw new Error(conflict.message);
    site.github = {
      owner,
      repo,
      branch: (input.branch || "main").trim() || "main",
      root: normalizeRoot(input.root),
      lastPushAt: site.github?.lastPushAt,
      lastPushSha: site.github?.lastPushSha,
      lastPushUrl: site.github?.lastPushUrl,
    };
    logActivity(store, {
      actor: "Operator",
      kind: "control",
      siteId,
      message: `GitHub connected: ${owner}/${repo} (${site.github.branch}, root ${site.github.root || "/"}).`,
    });
  });
  return (await getStore()).sites.find((s) => s.id === siteId)?.github;
}

export async function setGithubToken(token: string) {
  const trimmed = token.trim();
  await mutateStore((store) => {
    store.workspace.githubToken = trimmed || undefined;
    logActivity(store, {
      actor: "Operator",
      kind: "security",
      message: trimmed
        ? "GitHub token stored in workspace (repo scope). Used to push origin files for every property."
        : "GitHub token cleared.",
    });
  });
  return { ok: Boolean(trimmed) };
}

export async function pushOriginPack(siteId: string) {
  const store = await getStore();
  assertCanAct(store, "submissions");
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) throw new Error("Site not found");
  if (!site.github?.owner || !site.github.repo) {
    throw new Error("Attach a GitHub repo on this property first (owner / repo).");
  }
  const conflict = originRepoConflict(site, site.github, store.sites);
  if (conflict) throw new Error(conflict.message);
  const token = tokenFrom(store);
  if (!token) {
    throw new Error(
      "No GitHub token. Paste a classic PAT with repo scope on Command, or set GITHUB_TOKEN on the server.",
    );
  }

  const verifyToken = siteVerifyToken(site);
  const files = buildOriginPack({ ...site, verifyToken });

  // Look before writing. `buildOriginPack` generates from campaign state, so a
  // blind PUT replaces a site's own robots policy with a generic one — it did,
  // and the diff is in origin-ownership.ts. Only what the rule accepts is sent.
  const plan = await inspectOriginPack(siteId);
  if (plan.unreadable.length) {
    throw new Error(
      `Refusing to push: the repo would not answer for ${plan.unreadable.length} path(s) — ` +
        `${plan.unreadable.join("; ")}. A path that cannot be read cannot be safely written.`,
    );
  }
  const writablePaths = new Set(plan.writable.map((v) => v.path));
  const toWrite = files.filter((f) => writablePaths.has(f.path));
  if (!toWrite.length) {
    throw new Error(
      plan.blocked.length
        ? `Nothing to push — every file is spoken for. ${plan.blocked
            .map((v) => `${v.path}: ${v.reason}`)
            .join(" ")}`
        : "Nothing to push — the repo already holds exactly these files.",
    );
  }

  const results: Array<{ path: string; sha?: string; url?: string }> = [];
  const message = `CiteFleet origin pack for ${site.domain}`;
  for (const file of toWrite) {
    results.push(
      await putFile(
        token,
        {
          owner: site.github.owner,
          repo: site.github.repo,
          branch: site.github.branch,
        },
        file.path,
        file.content,
        message,
      ),
    );
  }
  const last = results.find((r) => r.url) || results[results.length - 1];
  await mutateStore((s) => {
    const current = s.sites.find((x) => x.id === siteId);
    if (current) current.verifyToken = verifyToken;
    if (current?.github) {
      current.github.lastPushAt = new Date().toISOString();
      current.github.lastPushSha = last?.sha;
      current.github.lastPushUrl = last?.url;
    }
    logActivity(s, {
      actor: "Orion",
      kind: "index",
      siteId,
      botId: "bot-orion",
      message:
        `Pushed ${results.length} origin files to ${site.github!.owner}/${site.github!.repo} ` +
        `(${results.map((r) => r.path).join(", ")}). Deploy that repo for them to go live.` +
        // The refusals are the point of the guard, so they belong in the audit
        // trail beside the writes — a push that skipped three files must never
        // read, later, as a push of four.
        (plan.blocked.length
          ? ` Left alone: ${plan.blocked
              .map((v) => `${v.path} (${v.state === "shadowed" ? `route owned by ${v.shadowedBy}` : "not CiteFleet's file"})`)
              .join(", ")}.`
          : ""),
    });
  });
  return {
    ok: true,
    repo: `${site.github.owner}/${site.github.repo}`,
    branch: site.github.branch,
    files: results,
    blocked: plan.blocked,
    commit: last?.url,
  };
}

export function stripSecrets(store: StoreShape): StoreShape {
  return maskStoreSecrets(store);
}
