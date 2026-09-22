import type { Site } from "./types.ts";
import { packFiles, type OriginFile } from "./originPack.ts";
import { classifyOriginFile, type OriginWriteState } from "./origin-ownership.ts";

const API_BASE = "https://developers.hostinger.com";
const MAX_FILE_BYTES = 1_000_000;
const PAGE_SIZE = 100;

type Website = {
  domain?: string | null;
  username?: string | null;
  root_directory?: string | null;
  website_type?: string | null;
  is_enabled?: boolean | null;
};
type FileEntry = { name: string; path: string; type: string; size_bytes: number | null };
type FileList = { path: string; items: FileEntry[]; total_items: number; offset: number };
type FileContent = { path: string; content: string; total_lines: number; size_bytes: number };
type UploadTicket = { url: string; auth_key: string; rest_auth_key: string };

export type HostingerFilePlan = {
  path: string;
  state: OriginWriteState;
  reason: string;
  generatedBytes: number;
};
export type HostingerInstallPlan = {
  domain: string;
  username: string;
  rootDirectory: string;
  files: HostingerFilePlan[];
  writable: boolean;
};
export type HostingerInstallResult = {
  plan: HostingerInstallPlan;
  uploaded: string[];
  verified: string[];
};
export type HostingerFilesDeps = {
  fetchImpl?: typeof fetch;
  apiBase?: string;
  sleep?: (ms: number) => Promise<void>;
};

function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${what} had an invalid response.`);
  return value as Record<string, unknown>;
}

function safePath(path: string): string {
  if (
    !path ||
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("An origin file has an unsafe path.");
  }
  return path.split("/").map(encodeURIComponent).join("/");
}

function exactDomain(site: Site): string {
  const domain = site.domain.toLowerCase();
  const url = new URL(site.url);
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== domain ||
    !/^[a-z0-9.-]+$/.test(domain)
  ) {
    throw new Error(
      "The CiteFleet site must use the exact HTTPS domain before a Hostinger install.",
    );
  }
  return domain;
}

function makeClient(accessToken: string, deps: HostingerFilesDeps) {
  if (!accessToken.trim()) throw new Error("Hostinger authorization is missing.");
  const fetchImpl = deps.fetchImpl ?? fetch;
  const base = new URL(deps.apiBase ?? API_BASE);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw new Error("The Hostinger API base URL is invalid.");
  }
  const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetchImpl(new URL(path, base), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Hostinger API returned ${response.status}.`);
    return (await response.json()) as T;
  };
  return { api, fetchImpl };
}

async function websiteFor(
  domain: string,
  api: ReturnType<typeof makeClient>["api"],
): Promise<Website> {
  for (let page = 1; page <= 5; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE), domain });
    const response = requireObject(
      await api<unknown>(`/api/hosting/v1/websites?${query}`),
      "Website list",
    );
    if (!Array.isArray(response.data))
      throw new Error("Hostinger website list did not include data.");
    const websites = response.data as Website[];
    const matches = websites.filter((item) => item?.domain?.toLowerCase() === domain);
    if (matches.length > 1)
      throw new Error("Hostinger returned more than one exact website match.");
    if (matches.length === 1) return matches[0];
    if (websites.length < PAGE_SIZE) break;
  }
  throw new Error(`The authorized Hostinger account has no exact website for ${domain}.`);
}

async function listFiles(
  api: ReturnType<typeof makeClient>["api"],
  username: string,
  domain: string,
  directory: string,
): Promise<FileEntry[]> {
  const url = `/api/hosting/v1/accounts/${encodeURIComponent(username)}/domains/${encodeURIComponent(domain)}/files`;
  const entries: FileEntry[] = [];
  for (let offset = 0; offset <= 5000; offset += 1000) {
    const query = new URLSearchParams({
      directory,
      max_depth: "1",
      max_items: "1000",
      offset: String(offset),
    });
    const result = requireObject(
      await api<unknown>(`${url}?${query}`),
      "File list",
    ) as unknown as FileList;
    if (!Array.isArray(result.items) || !Number.isInteger(result.total_items))
      throw new Error("Hostinger file list was incomplete.");
    entries.push(...result.items);
    if (entries.length >= result.total_items) return entries;
    if (!result.items.length)
      throw new Error("Hostinger file listing stopped before the last page.");
  }
  throw new Error("Hostinger file listing exceeded the inspection limit.");
}

async function readFile(
  api: ReturnType<typeof makeClient>["api"],
  username: string,
  domain: string,
  path: string,
): Promise<string> {
  const query = new URLSearchParams({ path, from_line: "0", max_lines: "5000" });
  const result = requireObject(
    await api<unknown>(
      `/api/hosting/v1/accounts/${encodeURIComponent(username)}/domains/${encodeURIComponent(domain)}/files/content?${query}`,
    ),
    "File content",
  ) as unknown as FileContent;
  if (
    result.path !== path ||
    typeof result.content !== "string" ||
    !Number.isInteger(result.total_lines) ||
    !Number.isInteger(result.size_bytes) ||
    result.size_bytes > MAX_FILE_BYTES ||
    result.total_lines > 5000 ||
    new TextEncoder().encode(result.content).length !== result.size_bytes
  ) {
    throw new Error(`Hostinger could not safely read all of ${path}.`);
  }
  return result.content;
}

async function liveFile(fetchImpl: typeof fetch, domain: string, path: string): Promise<Response> {
  const response = await fetchImpl(`https://${domain}/${safePath(path)}`, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (response.url && response.url !== `https://${domain}/${safePath(path)}`) {
    throw new Error(`The live ${path} route redirected during Hostinger inspection.`);
  }
  return response;
}

async function inspect(
  site: Site,
  accessToken: string,
  deps: HostingerFilesDeps,
): Promise<{ plan: HostingerInstallPlan; pack: OriginFile[] }> {
  const domain = exactDomain(site);
  const pack = packFiles(site);
  if (pack.length !== 5)
    throw new Error("Generate the IndexNow key before installing the five origin files.");
  const { api, fetchImpl } = makeClient(accessToken, deps);
  const website = await websiteFor(domain, api);
  if (
    website.is_enabled === false ||
    !website.username ||
    !website.root_directory ||
    ["builder", "horizons"].includes(website.website_type ?? "")
  ) {
    throw new Error(
      "This Hostinger website does not expose an enabled, writable Web/Cloud document root.",
    );
  }
  const username = website.username;
  const root = await listFiles(api, username, domain, "");
  const wellKnown = root.some((entry) => entry.path === ".well-known" && entry.type === "directory")
    ? await listFiles(api, username, domain, ".well-known")
    : null;
  const files: HostingerFilePlan[] = [];
  for (const file of pack) {
    safePath(file.path);
    const entries = file.path.startsWith(".well-known/") ? wellKnown : root;
    if (!entries) {
      files.push({
        path: file.path,
        state: "refused",
        reason:
          "The .well-known directory does not exist; directory creation is not verified for this Hostinger account.",
        generatedBytes: new TextEncoder().encode(file.content).length,
      });
      continue;
    }
    const found = entries.filter((entry) => entry.path === file.path);
    if (found.length > 1) throw new Error(`Hostinger returned duplicate entries for ${file.path}.`);
    if (found.length && found[0].type !== "file") {
      files.push({
        path: file.path,
        state: "refused",
        reason: "A non-file entry already occupies this path.",
        generatedBytes: new TextEncoder().encode(file.content).length,
      });
      continue;
    }
    const remote = found.length ? await readFile(api, username, domain, file.path) : null;
    const verdict = classifyOriginFile({ path: file.path, generated: file.content, remote });
    let state = verdict.state;
    let reason = verdict.reason;
    if (state === "create") {
      const live = await liveFile(fetchImpl, domain, file.path);
      if (live.status !== 404 && live.status !== 410) {
        state = "refused";
        reason = `The live route returned ${live.status}; CiteFleet cannot prove this path is free.`;
      }
    }
    files.push({
      path: file.path,
      state,
      reason,
      generatedBytes: new TextEncoder().encode(file.content).length,
    });
  }
  return {
    plan: {
      domain,
      username,
      rootDirectory: website.root_directory,
      files,
      writable: files.every(
        (file) => file.state === "create" || file.state === "update" || file.state === "identical",
      ),
    },
    pack,
  };
}

export async function inspectHostingerInstall(
  site: Site,
  accessToken: string,
  deps: HostingerFilesDeps = {},
): Promise<HostingerInstallPlan> {
  return (await inspect(site, accessToken, deps)).plan;
}

export async function installHostingerPack(
  site: Site,
  accessToken: string,
  deps: HostingerFilesDeps = {},
): Promise<HostingerInstallResult> {
  const { plan, pack } = await inspect(site, accessToken, deps);
  if (!plan.writable)
    throw new Error(
      "Hostinger installation refused: an existing or live origin path is not safe to replace.",
    );
  const writable = plan.files.filter((file) => file.state === "create" || file.state === "update");
  const { api, fetchImpl } = makeClient(accessToken, deps);
  const uploaded: string[] = [];
  if (writable.length) {
    const ticket = requireObject(
      await api<unknown>("/api/hosting/v1/files/upload-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: plan.username, domain: plan.domain }),
      }),
      "Upload URL",
    ) as unknown as UploadTicket;
    const endpoint = new URL(ticket.url);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      !ticket.auth_key ||
      !ticket.rest_auth_key
    ) {
      throw new Error("Hostinger returned an invalid upload URL.");
    }
    for (const file of writable) {
      const content = pack.find((candidate) => candidate.path === file.path)!.content;
      const bytes = new TextEncoder().encode(content);
      const upload = new URL(endpoint);
      upload.pathname = `${upload.pathname.replace(/\/$/, "")}/${safePath(file.path)}`;
      upload.searchParams.set("override", "true");
      const common = {
        "X-Auth": ticket.auth_key,
        "X-Auth-Rest": ticket.rest_auth_key,
        "Tus-Resumable": "1.0.0",
      };
      const start = await fetchImpl(upload, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: { ...common, "Upload-Length": String(bytes.length), "Upload-Offset": "0" },
      });
      if (start.status !== 201)
        throw new Error(`Hostinger upload creation failed for ${file.path} (${start.status}).`);
      const finish = await fetchImpl(upload, {
        method: "PATCH",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          ...common,
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": "0",
        },
        body: bytes,
      });
      if (finish.status !== 204 || finish.headers.get("upload-offset") !== String(bytes.length)) {
        throw new Error(`Hostinger upload did not complete for ${file.path} (${finish.status}).`);
      }
      uploaded.push(file.path);
    }
  }
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const verified: string[] = [];
  for (const file of pack) {
    let matches = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await liveFile(fetchImpl, plan.domain, file.path);
      if (response.status === 200 && (await response.text()) === file.content) {
        matches = true;
        break;
      }
      if (attempt < 2) await sleep(1000);
    }
    if (matches) verified.push(file.path);
  }
  if (verified.length !== pack.length) {
    throw new Error(
      `Hostinger uploaded ${uploaded.length} files, but only ${verified.length} of ${pack.length} live paths matched. Recheck after the host cache clears.`,
    );
  }
  return { plan, uploaded, verified };
}
