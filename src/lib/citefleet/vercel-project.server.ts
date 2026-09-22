import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { Site } from "./types.ts";
import { packFiles, buildOriginPack, type OriginFile } from "./originPack.ts";
import { githubRepoTarget, githubRoot } from "./origin-repo.ts";
import { frameworkSourceDirs, planOriginPack, shadowedOriginFile } from "./origin-ownership.ts";

export interface VercelProjectTarget {
  projectId: string;
  projectName: string;
  teamId: string | null;
  productionDeploymentId: string;
  repo: { owner: string; repo: string; repoId: number; branch: string; root: string };
}
export interface VercelProjectDeps {
  fetch: typeof fetch;
}
const LIMIT = 2_000_000;
const SHA = /^[a-f0-9]{40}$/;
type Obj = Record<string, unknown>;
function object(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Provider returned an invalid object.");
  return value as Obj;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1024)
    throw new Error("Provider returned an invalid identifier.");
  return value;
}
function sha(value: unknown): string {
  const result = string(value);
  if (!SHA.test(result)) throw new Error("Provider returned an invalid commit SHA.");
  return result;
}
async function boundedBytes(response: Response): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > LIMIT)
    throw new Error("Provider response is too large.");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) throw new Error("Provider response is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
async function api(
  base: string,
  token: string,
  path: string,
  deps: VercelProjectDeps,
  init: RequestInit = {},
  allow404 = false,
): Promise<unknown> {
  if (!token.trim()) throw new Error("Customer authorization is required.");
  const perform = () =>
    deps.fetch(`${base}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "CiteFleet",
        ...(base.includes("github") ? { "X-GitHub-Api-Version": "2022-11-28" } : {}),
      },
    });
  const readOnly = !init.method || init.method === "GET";
  let response: Response;
  try {
    response = await perform();
  } catch (error) {
    if (!readOnly) throw error;
    response = await perform();
  }
  if (readOnly && response.status >= 500) {
    await response.body?.cancel();
    response = await perform();
  }
  // Writes are never retried blindly; jobs recover by operation id or inspect
  // the pinned branch. A read failure remains an error, never an absent path.
  if (response.status === 404 && allow404) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Provider request failed (${response.status}).`);
  }
  if (!response.headers.get("content-type")?.includes("json"))
    throw new Error("Provider returned a non-JSON response.");
  return JSON.parse((await boundedBytes(response)).toString("utf8")) as unknown;
}
function vc(
  token: string,
  teamId: string | null,
  path: string,
  deps: VercelProjectDeps,
  init: RequestInit = {},
) {
  return api(
    "https://api.vercel.com",
    token,
    `${path}${teamId ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(teamId)}` : ""}`,
    deps,
    init,
  );
}
function host(site: Site): string {
  const url = new URL(site.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== site.domain.toLowerCase() ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)
  )
    throw new Error("Installation requires the exact public HTTPS website hostname.");
  return url.hostname;
}
export async function resolveVercelProject(
  token: string,
  teamId: string | null,
  site: Site,
  deps: VercelProjectDeps = { fetch },
): Promise<VercelProjectTarget> {
  const domain = host(site);
  const deployment = object(
    await vc(
      token,
      teamId,
      `/v13/deployments/${encodeURIComponent(domain)}?withGitRepoInfo=true`,
      deps,
    ),
  );
  const projectId = string(deployment.projectId);
  const project = object(
    await vc(token, teamId, `/v9/projects/${encodeURIComponent(projectId)}`, deps),
  );
  if (project.id !== projectId || (teamId && project.accountId !== teamId))
    throw new Error("Vercel project account does not match authorization.");
  const attached = object(
    await vc(
      token,
      teamId,
      `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`,
      deps,
    ),
  );
  if (
    attached.name !== domain ||
    attached.verified !== true ||
    attached.redirect ||
    attached.gitBranch
  )
    throw new Error("Vercel did not confirm the exact production website domain.");
  if (deployment.target !== "production" || deployment.readyState !== "READY")
    throw new Error("The website has no ready production deployment to extend.");
  if (project.framework !== "nextjs")
    throw new Error(
      "Automatic repository installation currently requires a Next.js Vercel project.",
    );
  const link = object(project.link);
  if (link.type !== "github") throw new Error("This Vercel project is not linked to GitHub.");
  const parsed = githubRepoTarget(string(link.org), string(link.repo));
  const repoId = Number(link.repoId);
  if (!Number.isSafeInteger(repoId) || repoId <= 0)
    throw new Error("Vercel returned an invalid GitHub repository id.");
  const branch = string(link.productionBranch);
  const projectRoot = githubRoot(
    project.rootDirectory == null ? "" : string(project.rootDirectory),
  );
  const root = projectRoot ? `${projectRoot}/public` : "public";
  if (site.github) {
    const saved = githubRepoTarget(site.github.owner, site.github.repo);
    if (
      saved.owner.toLowerCase() !== parsed.owner.toLowerCase() ||
      saved.repo.toLowerCase() !== parsed.repo.toLowerCase() ||
      site.github.branch !== branch ||
      githubRoot(site.github.root) !== root
    )
      throw new Error(
        "The saved GitHub repository, branch, or folder does not match Vercel's production project.",
      );
  }
  return {
    projectId,
    projectName: string(project.name),
    teamId,
    productionDeploymentId: string(deployment.id),
    repo: { owner: parsed.owner, repo: parsed.repo, repoId, branch, root },
  };
}
export async function installVercelRepoFiles(
  token: string,
  site: Site,
  target: VercelProjectTarget,
  deps: VercelProjectDeps = { fetch },
  expectedFiles?: OriginFile[],
): Promise<{ commitSha: string; files: OriginFile[]; alreadyCurrent: boolean }> {
  host(site);
  const files = packFiles(site);
  if (files.length !== 5)
    throw new Error("Generate the IndexNow key before installing five files.");
  if (
    expectedFiles &&
    (expectedFiles.length !== files.length ||
      files.some(
        (file, index) =>
          file.path !== expectedFiles[index].path || file.content !== expectedFiles[index].content,
      ))
  )
    throw new Error("The origin files changed since this installation was approved.");
  const repo = target.repo;
  const prefix = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  const gh = (path: string, init: RequestInit = {}, missing = false) =>
    api("https://api.github.com", token, `${prefix}${path}`, deps, init, missing);
  const metadata = object(await gh(""));
  if (metadata.id !== repo.repoId || object(metadata.permissions).push !== true)
    throw new Error("Customer GitHub authorization cannot write the exact Vercel repository.");
  const refPath = `/git/ref/heads/${encodeURIComponent(repo.branch)}`;
  const head = sha(object(object(await gh(refPath)).object).sha);
  const commit = object(await gh(`/git/commits/${head}`));
  const baseTree = sha(object(commit.tree).sha);
  const generated = buildOriginPack({ ...site, github: repo });
  const entries = object(await gh(`/git/trees/${baseTree}?recursive=1`));
  if (entries.truncated !== false || !Array.isArray(entries.tree))
    throw new Error("Cannot safely inspect the complete repository tree.");
  for (const raw of entries.tree) {
    const entry = object(raw);
    if (typeof entry.path !== "string") throw new Error("Invalid repository tree entry.");
    if (
      generated.some(
        (file) => file.path === entry.path || file.path.startsWith(`${entry.path}/`),
      ) &&
      entry.mode !== "040000" &&
      entry.mode !== "100644" &&
      entry.mode !== "100755"
    )
      throw new Error("Origin paths cannot contain symlinks or submodules.");
  }
  const remote = new Map<string, string | null>();
  for (const file of generated) {
    const raw = await gh(
      `/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${head}`,
      {},
      true,
    );
    if (raw === null) {
      remote.set(file.path, null);
      continue;
    }
    const item = object(raw);
    if (item.type !== "file" || item.encoding !== "base64" || typeof item.content !== "string")
      throw new Error(`Cannot safely inspect ${file.path}.`);
    remote.set(file.path, Buffer.from(item.content, "base64").toString("utf8"));
  }
  const routes = new Map<string, string>();
  // The complete pinned tree also sees nested Route Handlers and static Next
  // metadata, which a root-directory listing of robots.ts cannot detect.
  const projectPrefix = repo.root.slice(0, -"public".length);
  const appRoots = [`${projectPrefix}app/`, `${projectPrefix}src/app/`];
  for (const raw of entries.tree) {
    const entry = object(raw);
    const path = string(entry.path);
    const appRoot = appRoots.find((root) => path.startsWith(root));
    if (!appRoot || entry.type !== "blob") continue;
    const relative = path
      .slice(appRoot.length)
      .split("/")
      .filter((part) => !/^\([^/]+\)$/.test(part))
      .join("/");
    if (relative === "robots.txt" || relative === "sitemap.xml") routes.set(relative, path);
    const metadata = shadowedOriginFile(relative);
    if (metadata) routes.set(metadata, path);
    if (/\/route\.(?:ts|tsx|js|jsx|mjs)$/.test(relative)) {
      const endpoint = relative.replace(/\/route\.(?:ts|tsx|js|jsx|mjs)$/, "");
      const generatedFile = files.find((file) => file.path === endpoint);
      if (generatedFile) routes.set(generatedFile.path.split("/").pop()!, path);
    }
  }
  for (const directory of frameworkSourceDirs(repo.root)) {
    const entries = await gh(
      `/contents/${directory.split("/").map(encodeURIComponent).join("/")}?ref=${head}`,
      {},
      true,
    );
    if (entries === null) continue;
    if (!Array.isArray(entries)) throw new Error("Cannot inspect framework routes.");
    for (const raw of entries) {
      const item = object(raw);
      if (item.type === "file" && typeof item.name === "string") {
        const metadata =
          (directory === `${projectPrefix}app` || directory === `${projectPrefix}src/app`) &&
          (item.name === "robots.txt" || item.name === "sitemap.xml")
            ? item.name
            : null;
        const path = metadata ?? shadowedOriginFile(item.name);
        if (path) routes.set(path, `${directory}/${item.name}`);
      }
    }
  }
  const plan = planOriginPack(generated, remote, routes);
  if (plan.blocked.length)
    throw new Error(
      `Installation refused: ${plan.blocked.map((file) => `${file.path}: ${file.reason}`).join(" ")}`,
    );
  if (!plan.writable.length) return { commitSha: head, files, alreadyCurrent: true };
  const paths = new Set(plan.writable.map((file) => file.path));
  const tree = object(
    await gh("/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTree,
        tree: generated
          .filter((file) => paths.has(file.path))
          .map((file) => ({
            path: file.path,
            mode: "100644",
            type: "blob",
            content: file.content,
          })),
      }),
    }),
  );
  const created = object(
    await gh("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `CiteFleet origin files for ${site.domain}`,
        tree: sha(tree.sha),
        parents: [head],
      }),
    }),
  );
  const commitSha = sha(created.sha);
  const updated = object(
    await gh(`/git/refs/heads/${encodeURIComponent(repo.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commitSha, force: false }),
    }),
  );
  if (object(updated.object).sha !== commitSha)
    throw new Error("GitHub did not confirm the atomic installation commit.");
  return { commitSha, files, alreadyCurrent: false };
}
function deploymentIdentity(value: Obj, target: VercelProjectTarget, commitSha: string) {
  const source =
    value.gitSource && typeof value.gitSource === "object" ? object(value.gitSource) : {};
  const meta = value.meta && typeof value.meta === "object" ? object(value.meta) : {};
  if (
    value.projectId !== target.projectId ||
    value.target !== "production" ||
    (source.sha ?? meta.githubCommitSha) !== commitSha
  )
    throw new Error("Vercel deployment does not match the exact project and installation commit.");
}
export async function createVercelDeployment(
  token: string,
  target: VercelProjectTarget,
  commitSha: string,
  operationId: string,
  deps: VercelProjectDeps = { fetch },
): Promise<{ id: string; url: string }> {
  sha(commitSha);
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(operationId))
    throw new Error("Invalid installation operation.");
  let until: number | null = null;
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({
      projectId: target.projectId,
      target: "production",
      limit: "100",
    });
    if (until !== null) query.set("until", String(until));
    const result = object(await vc(token, target.teamId, `/v6/deployments?${query}`, deps));
    if (!Array.isArray(result.deployments))
      throw new Error("Cannot inspect existing deployments before creation.");
    for (const raw of result.deployments) {
      const item = object(raw);
      if (item.meta && object(item.meta).citefleetOperationId === operationId) {
        const id = string(item.uid);
        await readVercelDeployment(token, target, id, commitSha, deps);
        return { id, url: deploymentUrl(item.url) };
      }
    }
    const next = result.pagination ? object(result.pagination).next : null;
    if (next == null) break;
    if (typeof next !== "number" || !Number.isFinite(next) || next === until || page === 9)
      throw new Error("Deployment history exceeded the safe recovery limit.");
    until = next;
  }
  const result = object(
    await vc(token, target.teamId, "/v13/deployments", deps, {
      method: "POST",
      body: JSON.stringify({
        name: target.projectName,
        project: target.projectId,
        deploymentId: target.productionDeploymentId,
        target: "production",
        gitSource: { type: "github", repoId: target.repo.repoId, ref: commitSha },
        meta: { citefleetOperationId: operationId },
      }),
    }),
  );
  const id = string(result.id);
  // The follow-up resolves the authoritative source, not the request we sent.
  await readVercelDeployment(token, target, id, commitSha, deps);
  return { id, url: deploymentUrl(result.url) };
}
function deploymentUrl(value: unknown): string {
  const raw = string(value);
  const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Vercel returned an invalid deployment URL.");
  return url.origin;
}
export async function readVercelDeployment(
  token: string,
  target: VercelProjectTarget,
  deploymentId: string,
  commitSha: string,
  deps: VercelProjectDeps = { fetch },
): Promise<{ state: "building" | "ready" | "failed"; message?: string }> {
  sha(commitSha);
  const value = object(
    await vc(
      token,
      target.teamId,
      `/v13/deployments/${encodeURIComponent(deploymentId)}?withGitRepoInfo=true`,
      deps,
    ),
  );
  if (value.id !== deploymentId) throw new Error("Vercel returned a different deployment.");
  deploymentIdentity(value, target, commitSha);
  if (value.readyState === "READY") return { state: "ready" };
  if (value.readyState === "ERROR" || value.readyState === "CANCELED")
    return {
      state: "failed",
      message:
        "Vercel could not publish the application. Inspect its build logs; the files are not verified live.",
    };
  if (!["QUEUED", "INITIALIZING", "BUILDING"].includes(String(value.readyState)))
    throw new Error("Vercel returned an unknown deployment state.");
  return { state: "building" };
}
/** IPv4-only verification deliberately fails closed for IPv6-only origins. */
export function isPublicVercelAddress(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
async function publicOriginFetch(input: Parameters<typeof fetch>[0]): Promise<Response> {
  const url = new URL(String(input));
  if (url.protocol !== "https:" || url.port || url.username || url.password)
    throw new Error("Public HTTPS origin required.");
  // Bound the DNS step as well as TLS and the body. The chosen address is
  // supplied to the socket lookup, closing the check/connect rebinding gap.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const records = await Promise.race([
    lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Origin DNS lookup timed out.")), 10000);
    }),
  ]).finally(() => clearTimeout(timer));
  if (!records.length || records.some((record) => !isPublicVercelAddress(record.address)))
    throw new Error("Origin DNS must resolve only to public IPv4 addresses.");
  const address = records[0].address;
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(15000),
        headers: {
          "Accept-Encoding": "identity",
          "Cache-Control": "no-cache",
          "User-Agent": "CiteFleetOriginVerifier/1.0",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [{ address, family: 4 }]);
          else callback(null, address, 4);
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > LIMIT) {
            request.destroy(new Error("Origin response is too large."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const status = response.statusCode ?? 502;
          if (status >= 300 && status < 400) {
            reject(new Error("Origin file redirected."));
            return;
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (value !== undefined)
              headers.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
          resolve(
            new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
              status,
              headers,
            }),
          );
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}
export async function verifyVercelOriginFiles(
  site: Site,
  files: OriginFile[],
  deps: VercelProjectDeps = { fetch: publicOriginFetch },
): Promise<{ verified: string[]; problems: string[] }> {
  const domain = host(site);
  const expected = packFiles(site);
  if (
    files.length !== 5 ||
    expected.length !== 5 ||
    files.some((file, index) => file.path !== expected[index].path)
  )
    throw new Error("Expected exactly the five origin file paths.");
  const verified: string[] = [],
    problems: string[] = [];
  for (const file of files) {
    try {
      const url = `https://${domain}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
      const response = await deps.fetch(url, {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const allowed =
        file.path === "sitemap.xml" ? ["application/xml", "text/xml"] : ["text/plain"];
      if (
        response.status !== 200 ||
        !allowed.includes(type) ||
        (response.url && response.url !== url)
      ) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}, content type ${type || "missing"}.`);
      }
      if (!(await boundedBytes(response)).equals(Buffer.from(file.content, "utf8")))
        throw new Error("Public bytes differ from the installed file.");
      verified.push(file.path);
    } catch (error) {
      problems.push(
        `${file.path}: ${error instanceof Error ? error.message : "Verification failed."}`,
      );
    }
  }
  return { verified, problems };
}
