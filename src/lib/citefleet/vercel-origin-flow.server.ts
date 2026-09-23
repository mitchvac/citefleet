import { readCookie, safeEqual, type SessionUser } from "../auth/operator-core.ts";
import { githubRoot } from "./origin-repo.ts";
import { vercelAuthorizationUrl } from "./vercel-dns.server.ts";
import {
  ORIGIN_COOKIE,
  ORIGIN_PATH,
  ORIGIN_STATE_COOKIE,
  originConfig,
  originCookie,
  originNonce,
  originPendingToken,
  loadOriginMetadata,
  validOriginNonce,
  type OriginMetadata,
} from "./vercel-origin.server.ts";
import {
  bindOriginPending,
  consumeOriginPending,
  createOriginPending,
  finishOriginPending,
} from "./vercel-origin-state.server.ts";
import type { WorkspaceHandle } from "./workspace-handle.ts";
import type { Sql } from "../db.ts";

type FlowDeps = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  sql?: Sql;
  user?: (request: Request) => Promise<SessionUser | null>;
  workspace?: (user: SessionUser) => Promise<WorkspaceHandle>;
  onboard?: (
    ws: WorkspaceHandle,
    input: {
      name: string;
      url: string;
      github: { owner: string; repo: string; branch: string; root: string };
    },
  ) => Promise<{ id: string }>;
  attach?: (
    ws: WorkspaceHandle,
    siteId: string,
    github: { owner: string; repo: string; branch: string; root: string },
  ) => Promise<unknown>;
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};
function page(title: string, content: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)} | CiteFleet Origin</title><style>body{margin:0;background:#0c0914;color:#e9e4f4;font:17px/1.6 system-ui}main{max-width:760px;margin:4rem auto;padding:0 24px;overflow-wrap:anywhere}a{color:#4ee0c3}h1{line-height:1.2}fieldset{margin:24px 0;padding:20px;border:1px solid #645578;border-radius:12px;min-width:0}label{display:block;margin:12px 0}input[type=text],select,button{box-sizing:border-box;width:100%;min-height:44px;padding:10px;font:inherit;border-radius:6px}input[type=checkbox]{width:20px;height:20px;vertical-align:middle}button{background:#4ee0c3;color:#101820;border:0;font-weight:700;cursor:pointer}code{white-space:normal}small{color:#c0b8ce}.notice{border-left:3px solid #4ee0c3;padding-left:16px}</style></head><body><main><a href="/docs/integrations/vercel">CiteFleet Origin documentation</a><h1>${escape(title)}</h1>${content}<p><a href="/support">Contact support</a></p></main></body></html>`,
    {
      status,
      headers: {
        ...headers,
        // no-referrer makes browser form POST Origin opaque ("null").
        // strict-origin preserves CSRF's exact-origin proof without leaking paths/codes.
        "Referrer-Policy": "strict-origin",
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
function redirect(location: string, cookies: string[] = []): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Location", location);
  for (const cookie of cookies) responseHeaders.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers: responseHeaders });
}

function unavailable(): Response {
  return page(
    "Vercel Origin setup is not configured",
    "<p>The installation endpoint is deployed, but its Vercel integration credentials have not been configured. The operator must save the integration in Vercel and configure its client ID and secret before installations can continue.</p><p>No project was changed. Return to Vercel and restart installation after configuration.</p>",
    503,
  );
}
export async function startOriginInstall(request: Request, deps: FlowDeps = {}): Promise<Response> {
  try {
    const config = originConfig(deps.env);
    if (!config) return unavailable();
    const state = originNonce();
    return redirect(vercelAuthorizationUrl(config, state), [
      originCookie(request, ORIGIN_STATE_COOKIE, state),
    ]);
  } catch {
    return unavailable();
  }
}
export async function originCallback(request: Request, deps: FlowDeps = {}): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (originPendingToken(request))
      return page(
        "An installation is already open",
        `<p>Finish or cancel your current installation before starting another.</p><p><a href="${ORIGIN_PATH}">Continue setup</a></p>`,
        409,
      );
    const code = url.searchParams.get("code"),
      id = url.searchParams.get("configurationId");
    if (!code || !id)
      return page(
        "Start with Vercel",
        '<p>This is the CiteFleet Origin installation callback. Open CiteFleet Origin in Vercel and choose Add Integration to begin.</p><p><a href="/api/integrations/vercel/start">Start installation</a></p>',
        400,
      );
    const state = url.searchParams.get("state");
    const expected = readCookie(request.headers.get("cookie"), ORIGIN_STATE_COOKIE);
    if (
      (state || expected) &&
      (!state || !expected || !validOriginNonce(state) || !safeEqual(state, expected))
    )
      return page(
        "Installation state did not match",
        "<p>Restart the installation in the same browser.</p>",
        403,
      );
    const config = originConfig(deps.env);
    if (!config) return unavailable();
    const metadata = await loadOriginMetadata(
      code,
      id,
      url.searchParams.get("teamId"),
      url.searchParams.get("next"),
      config,
      deps.fetch,
    );
    if (!metadata.projects.length)
      return page(
        "No supported projects found",
        "<p>Select a GitHub-connected Vercel project with a verified production domain and production branch. GitLab, Bitbucket and projects without a Git connection can use the manual file workflow in the documentation.</p>",
        422,
      );
    const token = await createOriginPending(metadata, deps.sql);
    // A marketplace entry may have no app-originated state. It may only stage
    // metadata: an authenticated, CSRF-protected confirmation is still required.
    const user = await sessionUser(request, deps);
    if (user) {
      const ws = await workspace(user, deps);
      if (!(await bindOriginPending(token, user.id, ws.id, deps.sql)))
        throw new Error("Workspace unavailable.");
    }
    return redirect(ORIGIN_PATH, [
      originCookie(request, ORIGIN_COOKIE, token),
      originCookie(request, ORIGIN_STATE_COOKIE, "", 0),
    ]);
  } catch {
    return page(
      "Vercel authorization could not be completed",
      "<p>No files were written. Check that the integration has Integration Configuration and Projects read access, then restart installation from Vercel. If the error continues, contact support.</p>",
      502,
    );
  }
}
async function sessionUser(request: Request, deps: FlowDeps): Promise<SessionUser | null> {
  return deps.user
    ? deps.user(request)
    : (await import("../auth/operator.server.ts")).currentSessionUser(request);
}
async function workspace(user: SessionUser, deps: FlowDeps): Promise<WorkspaceHandle> {
  return deps.workspace
    ? deps.workspace(user)
    : (await import("./workspace-registry.server.ts")).workspaceForPrincipal({
        kind: "user",
        userId: user.id,
        email: user.email,
      });
}
export function originSubmission(request: Request, form: URLSearchParams, token: string): boolean {
  let origin: URL;
  let expected: URL;
  try {
    origin = new URL(request.headers.get("origin") || "");
    expected = new URL(process.env.CITEFLEET_PUBLIC_URL || request.url);
  } catch {
    return false;
  }
  // Exact configured origin AND synchronizer token; SameSite alone is insufficient.
  return (
    origin.origin === expected.origin &&
    !["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") || "") &&
    validOriginNonce(token) &&
    safeEqual(form.get("csrf") || "", token)
  );
}
function projectForms(metadata: OriginMetadata, token: string): string {
  return metadata.projects
    .map(
      (p) =>
        `<fieldset><legend>${escape(p.name)}</legend><p>Repository: <strong>${escape(p.owner)}/${escape(p.repo)}</strong><br>Production branch: <strong>${escape(p.branch || "Not reported by Vercel — confirm below")}</strong><br>Vercel project root: <code>${escape(p.rootDirectory || "/")}</code></p><form method="post" action="${ORIGIN_PATH}"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="project" value="${escape(p.id)}">${p.branch ? "" : '<label>Production branch<input type="text" name="branch" required maxlength="256" title="Enter the exact production branch configured in Vercel; do not guess."></label>'}<label>Production domain<select name="domain" required title="Choose the verified production domain whose files will be generated.">${p.domains.map((d) => `<option value="${escape(d)}">${escape(d)}</option>`).join("")}</select></label><label>Served static folder (repository-relative)<input type="text" name="root" required maxlength="512" placeholder="public or frontend/public; / for repository root" title="Enter the folder your framework serves as static files, not the build output folder."></label><small>Vercel's project root is not necessarily the static folder. Use public for frameworks that serve public/, or / for repository-root static sites. Confirm the actual layout first.</small><label><input type="checkbox" name="confirm" value="yes" required> I started this Vercel installation, manage this website, and confirm the domain, repository, production branch and served folder.</label><button type="submit">Save project and review GitHub installation</button></form></fieldset>`,
    )
    .join("");
}
export async function originSetup(request: Request, deps: FlowDeps = {}): Promise<Response> {
  const token = originPendingToken(request);
  if (!token)
    return page(
      "Connect your Vercel project",
      '<p>Start from Vercel to choose a GitHub-connected project. CiteFleet will ask you to confirm its domain and served folder before creating a property. GitHub authorization is a separate step that can commit discovery files.</p><p><a href="/api/integrations/vercel/start">Start Vercel installation</a></p>',
    );
  try {
    let form = new URLSearchParams();
    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
        return page("Invalid form", "<p>Submit the setup form.</p>", 415);
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (reader) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 4096) {
          await reader.cancel();
          return page("Invalid form", "<p>Form is too large.</p>", 413);
        }
        chunks.push(part.value);
      }
      form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
      if (!originSubmission(request, form, token))
        return page(
          "Confirmation rejected",
          "<p>Reload setup and submit its confirmation form.</p>",
          403,
        );
      if (form.get("action") === "cancel")
        return redirect(ORIGIN_PATH, [originCookie(request, ORIGIN_COOKIE, "", 0)]);
    }
    const cancel = `<form method="post" action="${ORIGIN_PATH}"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="action" value="cancel"><button type="submit">Cancel this installation</button></form>`;
    if (new URL(request.url).searchParams.has("cancel")) return page("Cancel installation", cancel);
    const user = await sessionUser(request, deps);
    if (!user) return redirect("/login");
    const ws = await workspace(user, deps);
    const pending = await bindOriginPending(token, user.id, ws.id, deps.sql);
    if (!pending)
      return page(
        "Installation expired or belongs to another account",
        `<p>Sign in with the account that began setup, or cancel this browser's installation and restart from Vercel.</p>${cancel}`,
        403,
      );
    if (request.method === "POST" && form.get("action") === "complete" && pending.site_id)
      return redirect(pending.metadata.next || `/sites/${pending.site_id}`, [
        originCookie(request, ORIGIN_COOKIE, "", 0),
      ]);
    if (pending.site_id)
      return page(
        "Project saved — install and verify files",
        `<p>Your CiteFleet property is ready for the next step. No deployment or paid listing has been verified by saving it.</p><p><a href="/api/oauth/github?connect=${encodeURIComponent(pending.site_id)}">Connect GitHub and install discovery files</a></p><p>This can commit to the production branch you confirmed. Existing file ownership checks and workspace controls apply. GitHub access is retained for future file updates.</p><p><a href="/sites/${encodeURIComponent(pending.site_id)}">Open the campaign to inspect results and verify live files</a></p><p>After GitHub approval, check the Vercel deployment and return to this setup page to finish the Vercel connection. Listing on BotCentral remains a separate action.</p><form method="post" action="${ORIGIN_PATH}"><input type="hidden" name="csrf" value="${token}"><input type="hidden" name="action" value="complete"><button type="submit">${pending.metadata.next ? "Finish connection and return to Vercel" : "Finish connection and open campaign"}</button></form>`,
      );
    if (pending.consumed_at)
      return page(
        "Setup was already submitted",
        `<p>Check your campaign for the saved property. If setup failed, cancel and restart; no automatic retry will write a second property.</p>${cancel}`,
        409,
      );
    if (request.method !== "POST")
      return page(
        "Confirm your Vercel project",
        `<p class="notice">Signed in as <strong>${escape(user.email)}</strong>. Only continue if you initiated this installation. Saving configures this account's workspace; it does not yet write files or charge a listing fee.</p>${projectForms(pending.metadata, token)}${cancel}`,
      );
    const project = pending.metadata.projects.find((p) => p.id === form.get("project"));
    const domain = form.get("domain") || "";
    const folder = form.get("root");
    if (
      !project ||
      !project.domains.includes(domain) ||
      form.get("confirm") !== "yes" ||
      folder === null ||
      !folder.trim()
    )
      return page(
        "Confirm all project details",
        "<p>Choose an authorized project and domain, enter the served folder, and confirm your permission. Use Back to correct the form.</p>",
        400,
      );
    const branch = project.branch || form.get("branch")?.trim() || "";
    if (
      !branch ||
      branch.length > 256 ||
      [...branch].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      return page(
        "Production branch required",
        "<p>Enter the exact production branch from your Vercel project settings.</p>",
        400,
      );
    const github = { owner: project.owner, repo: project.repo, branch, root: githubRoot(folder) };
    const matches = (await ws.get()).sites.filter((s) => s.domain.toLowerCase() === domain);
    if (matches.length > 1)
      return page(
        "Duplicate properties found",
        "<p>Resolve duplicate properties for this domain in your workspace before connecting Vercel.</p>",
        409,
      );
    if (!(await consumeOriginPending(token, user.id, ws.id, deps.sql)))
      return page("Setup was already submitted", "<p>Reload this page to see the result.</p>", 409);
    let siteId: string;
    if (matches.length) {
      siteId = matches[0].id;
      const attach = deps.attach ?? (await import("./github.ts")).attachGithub;
      await attach(ws, siteId, github);
    } else {
      const onboard = deps.onboard ?? (await import("./dispatcher.ts")).onboardSite;
      siteId = (await onboard(ws, { name: project.name, url: `https://${domain}`, github })).id;
    }
    await finishOriginPending(token, user.id, ws.id, siteId, deps.sql);
    return redirect(ORIGIN_PATH);
  } catch {
    return page(
      "Project setup could not finish",
      "<p>No installation success is claimed. Check the campaign for existing properties and repository ownership conflicts. Restart the Vercel installation after resolving the issue; contact support if it persists.</p>",
      422,
    );
  }
}
