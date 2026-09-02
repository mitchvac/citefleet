import type { Site, StoreShape } from "./types";
import { buildOriginPack } from "./originPack";
import { assertCanAct } from "./control";
import { getStore, logActivity, mutateStore } from "./store";

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

export async function attachGithub(
  siteId: string,
  input: { owner: string; repo: string; branch?: string; root?: string },
) {
  const owner = input.owner.trim().replace(/^@/, "");
  const repo = input.repo.trim().replace(/\.git$/, "");
  if (!owner || !repo) throw new Error("GitHub owner and repo are required");
  await mutateStore((store) => {
    const site = store.sites.find((s) => s.id === siteId);
    if (!site) throw new Error("Site not found");
    if (repo.toLowerCase() === "citefleet" && site.domain !== "citefleet.app") {
      throw new Error(
        `Wrong repo. ${site.domain} files must go in the website repo that deploys to ${site.url}, not mitchvac/citefleet.`,
      );
    }
    site.github = {
      owner,
      repo,
      branch: (input.branch || "main").trim() || "main",
      root: (input.root ?? "public").replace(/^\/|\/$/g, ""),
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
  if (
    site.github.repo.toLowerCase() === "citefleet" &&
    site.domain !== "citefleet.app"
  ) {
    throw new Error(
      `Wrong repo. ${site.domain} files must go in the website repo that deploys to ${site.url}, not mitchvac/citefleet. CiteFleet public/ is only for citefleet.app.`,
    );
  }
  const token = tokenFrom(store);
  if (!token) {
    throw new Error(
      "No GitHub token. Paste a classic PAT with repo scope on Command, or set GITHUB_TOKEN on the server.",
    );
  }

  const files = buildOriginPack(site);
  const results: Array<{ path: string; sha?: string; url?: string }> = [];
  const message = `CiteFleet origin pack for ${site.domain}`;
  for (const file of files) {
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
      message: `Pushed ${results.length} origin files to ${site.github!.owner}/${site.github!.repo} (${results.map((r) => r.path).join(", ")}). Deploy that repo for them to go live.`,
    });
  });
  return {
    ok: true,
    repo: `${site.github.owner}/${site.github.repo}`,
    branch: site.github.branch,
    files: results,
    commit: last?.url,
  };
}

export function stripSecrets(store: StoreShape): StoreShape {
  const clone = structuredClone(store);
  if (clone.workspace.githubToken) {
    clone.workspace.githubToken = "set";
  }
  return clone;
}
