import { createHash, randomBytes } from "node:crypto";
import { readCookie } from "../auth/operator-core.ts";
import { githubRepoTarget, githubRoot } from "./origin-repo.ts";
import {
  exchangeVercelCode,
  vercelCompletionUrl,
  type VercelOAuthConfig,
} from "./vercel-dns.server.ts";

export const ORIGIN_PATH = "/integrations/vercel";
export const ORIGIN_CALLBACK = "/api/integrations/vercel/callback";
export const ORIGIN_COOKIE = "citefleet_vercel_origin";
export const ORIGIN_STATE_COOKIE = "citefleet_vercel_origin_state";
export const ORIGIN_TTL_SECONDS = 1800;
export const originNonce = () => randomBytes(32).toString("hex");
export const originDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export const validOriginNonce = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);
export function originCookie(
  request: Request,
  name: string,
  value: string,
  maxAge = ORIGIN_TTL_SECONDS,
): string {
  const secure =
    request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export function originPendingToken(request: Request): string {
  const value = readCookie(request.headers.get("cookie"), ORIGIN_COOKIE) || "";
  return validOriginNonce(value) ? value : "";
}
/** Fixed path only; a cookie cannot turn sign-in into an external redirect. */
export function originLoginContinuation(request: Request): string {
  return originPendingToken(request) ? ORIGIN_PATH : "/";
}
export function originConfig(env: NodeJS.ProcessEnv = process.env): VercelOAuthConfig | null {
  const integrationSlug = env.CITEFLEET_VERCEL_ORIGIN_INTEGRATION_SLUG?.trim() || "";
  const clientId = env.CITEFLEET_VERCEL_ORIGIN_CLIENT_ID?.trim() || "";
  const clientSecret = env.CITEFLEET_VERCEL_ORIGIN_CLIENT_SECRET?.trim() || "";
  if (!integrationSlug && !clientId && !clientSecret) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(integrationSlug) || !clientId || !clientSecret)
    throw new Error("Origin integration credentials are incomplete.");
  const origin = new URL(env.CITEFLEET_PUBLIC_URL || "https://citefleet.app");
  if (
    origin.username ||
    origin.password ||
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
  )
    throw new Error("Origin requires an HTTPS public URL.");
  return {
    integrationSlug,
    clientId,
    clientSecret,
    redirectUri: `${origin.origin}${ORIGIN_CALLBACK}`,
  };
}
export type OriginProject = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  branch: string | null;
  rootDirectory: string;
  domains: string[];
};
export type OriginMetadata = {
  configurationId: string;
  teamId: string | null;
  projects: OriginProject[];
  next: string | null;
};
const object = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
function boundedString(v: unknown, max = 256): string {
  if (
    typeof v !== "string" ||
    !v ||
    v.length > max ||
    [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error("Vercel returned invalid project metadata.");
  return v;
}
export function parseOriginProject(value: unknown): OriginProject | null {
  const p = object(value),
    link = object(p.link);
  if (link.type !== "github") return null;
  const id = boundedString(p.id);
  if (!/^prj_[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid Vercel project ID.");
  const repo = githubRepoTarget(boundedString(link.org), boundedString(link.repo));
  const branch =
    link.productionBranch == null || link.productionBranch === ""
      ? null
      : boundedString(link.productionBranch);
  const rootDirectory =
    p.rootDirectory == null || p.rootDirectory === ""
      ? ""
      : githubRoot(boundedString(p.rootDirectory, 512));
  return {
    id,
    name: boundedString(p.name),
    owner: repo.owner,
    repo: repo.repo,
    branch,
    rootDirectory,
    domains: [],
  };
}
export function parseOriginDomain(value: unknown, projectId: string): string | null {
  const d = object(value);
  if (
    d.projectId !== projectId ||
    d.verified !== true ||
    d.redirect ||
    d.gitBranch ||
    d.customEnvironmentId
  )
    return null;
  const name = boundedString(d.name, 253).toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) return null;
  return name;
}
async function boundedResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Vercel returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new Error("Vercel response too large. Select fewer projects.");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
/** JSON-only, bounded reads; never follow a provider redirect with a bearer token. */
async function apiJson(
  url: URL,
  token: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown> | unknown[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status >= 500 && attempt === 0) {
      await response.body?.cancel();
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      throw new Error(
        "Vercel project access failed. Reinstall with Integration Configuration and Projects read access.",
      );
    }
    const data: unknown = JSON.parse(await boundedResponseText(response));
    if (!data || typeof data !== "object") throw new Error("Vercel returned invalid JSON.");
    return data as Record<string, unknown> | unknown[];
  }
  throw new Error("Vercel is unavailable. Restart the installation.");
}
export async function loadOriginMetadata(
  code: string,
  configurationId: string,
  queryTeam: string | null,
  next: string | null,
  config: VercelOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<OriginMetadata> {
  if (!code || code.length > 2048 || !/^icfg_[A-Za-z0-9]+$/.test(configurationId))
    throw new Error("Start an installation from Vercel to obtain a valid callback.");
  const authorization = await exchangeVercelCode(code, config, {
    fetch: async (input, init) => {
      const response = await fetcher(input, { ...init, redirect: "error" });
      if (!response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        throw new Error("Vercel token response was not JSON.");
      }
      return new Response(await boundedResponseText(response), {
        status: response.status,
        headers: response.headers,
      });
    },
  });
  if (queryTeam !== null && queryTeam !== authorization.teamId)
    throw new Error("Vercel team did not match the authorization.");
  const api = (path: string, params: Record<string, string> = {}) => {
    const url = new URL(path, "https://api.vercel.com");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (authorization.teamId) url.searchParams.set("teamId", authorization.teamId);
    return apiJson(url, authorization.accessToken, fetcher);
  };
  const installation = object(await api(`/v1/integrations/configuration/${configurationId}`));
  if (
    installation.id !== configurationId ||
    installation.integrationId !== config.clientId ||
    (installation.teamId ?? null) !== authorization.teamId ||
    installation.disabledAt ||
    installation.deletedAt
  )
    throw new Error("Vercel installation identity did not match.");
  if (installation.projectSelection !== "all" && installation.projectSelection !== "selected")
    throw new Error("Vercel project selection is invalid.");
  const allowed = installation.projectSelection === "selected" ? installation.projects : null;
  if (
    installation.projectSelection === "selected" &&
    (!Array.isArray(allowed) || allowed.some((id: unknown) => typeof id !== "string"))
  )
    throw new Error("Vercel project permissions are invalid.");
  const listing = await api("/v10/projects", { limit: "21" });
  const rawProjects = Array.isArray(listing) ? listing : listing.projects;
  if (
    !Array.isArray(rawProjects) ||
    rawProjects.length > 20 ||
    object(object(listing).pagination).next != null
  )
    throw new Error("Select at most 20 Vercel projects for this installation.");
  const projects: OriginProject[] = [];
  for (const raw of rawProjects) {
    const project = parseOriginProject(raw);
    if (!project || (Array.isArray(allowed) && !allowed.includes(project.id))) continue;
    const data = object(
      await api(`/v9/projects/${project.id}/domains`, {
        limit: "100",
        production: "true",
        redirects: "false",
        verified: "true",
      }),
    );
    if (!Array.isArray(data.domains) || object(data.pagination).next != null)
      throw new Error("Project has too many domains. Use the manual GitHub workflow.");
    project.domains = [
      ...new Set(
        data.domains
          .map((d: unknown) => parseOriginDomain(d, project.id))
          .filter((d): d is string => d !== null),
      ),
    ];
    if (project.domains.length) projects.push(project);
  }
  return {
    configurationId,
    teamId: authorization.teamId,
    projects,
    next: vercelCompletionUrl(next),
  };
}
