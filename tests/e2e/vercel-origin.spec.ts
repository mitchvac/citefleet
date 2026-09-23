import { expect, test, type BrowserContext } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";

// Real built routes, account sessions, PostgreSQL, and browser forms. Provider
// authorization is NOT exercised: metadata is seeded at that external boundary.
const base = process.env.E2E_URL || "http://127.0.0.1:4191";
const database = process.env.E2E_ORIGIN_DATABASE_URL || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(base)) throw new Error("Local server required");
if (!database.includes("127.0.0.1:54322/citefleet_origin_validation_"))
  throw new Error("Disposable installer database required");
const pool = new Pool({ connectionString: database });
const marker = `origin-${Date.now()}-${randomBytes(4).toString("hex")}`;
const userIds: string[] = [];
const workspaceIds: string[] = [];
const hashes: string[] = [];
const metadata = {
  configurationId: "icfg_testInstallation",
  teamId: "team_testOwner",
  projects: [
    {
      id: "prj_testProject",
      name: marker,
      owner: "origin-test-owner",
      repo: marker,
      branch: "main",
      rootDirectory: "",
      domains: ["origin-test.example"],
    },
  ],
  next: "https://vercel.com/dashboard",
};
async function account(context: BrowserContext, suffix: string) {
  const email = `${marker}-${suffix}@example.invalid`;
  const password = randomBytes(24).toString("hex");
  const response = await context.request.post(`${base}/api/signup`, {
    form: { email, password, name: marker },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).not.toContain("error");
  const result = await pool.query(
    "SELECT u.id,m.workspace_id FROM citefleet_users u JOIN citefleet_workspace_members m ON m.user_id=u.id WHERE u.email=$1",
    [email],
  );
  expect(result.rows).toHaveLength(1);
  userIds.push(result.rows[0].id);
  workspaceIds.push(result.rows[0].workspace_id);
  return { email, password, ...result.rows[0] };
}
async function pending(context: BrowserContext) {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  hashes.push(hash);
  await pool.query(
    "INSERT INTO citefleet_vercel_origin_installs(token_hash,metadata,expires_at) VALUES ($1,$2::jsonb,now()+interval '30 minutes')",
    [hash, JSON.stringify(metadata)],
  );
  await context.addCookies([
    { name: "citefleet_vercel_origin", value: token, url: base, httpOnly: true, sameSite: "Lax" },
  ]);
  return { token, hash };
}
test.afterAll(async () => {
  // Marker-only, FK-ordered cleanup. Never delete another run's workspace.
  await pool.query(
    "DELETE FROM citefleet_vercel_origin_installs WHERE token_hash=ANY($1::text[])",
    [hashes],
  );
  await pool.query("DELETE FROM citefleet_snapshot WHERE id=ANY($1::text[])", [workspaceIds]);
  await pool.query("DELETE FROM citefleet_workspace_members WHERE workspace_id=ANY($1::text[])", [
    workspaceIds,
  ]);
  await pool.query("DELETE FROM citefleet_workspaces WHERE id=ANY($1::text[])", [workspaceIds]);
  await pool.query("DELETE FROM citefleet_sessions WHERE user_id=ANY($1::text[])", [userIds]);
  await pool.query("DELETE FROM citefleet_users WHERE id=ANY($1::text[])", [userIds]);
  await pool.end();
});
test("callback fails honestly, setup is readable at mobile widths", async ({ page }) => {
  const callback = await page.request.get(`${base}/api/integrations/vercel/callback`);
  expect(callback.status()).toBe(400);
  expect(callback.headers()["content-type"]).toContain("text/html");
  expect(await callback.text()).toContain("Start with Vercel");
  const unconfigured = await page.request.get(
    `${base}/api/integrations/vercel/callback?code=test&configurationId=icfg_test`,
  );
  expect(unconfigured.status()).toBe(503);
  expect(await unconfigured.text()).toContain("not configured");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/integrations/vercel`);
    await expect(page.getByRole("heading", { name: "Connect your Vercel project" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
test("account binding, CSRF refusal, real project save, replay refusal and cross-account cancellation", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const userA = await account(a, "a");
    const userB = await account(b, "b");
    const { token, hash } = await pending(a);
    const page = await a.newPage();
    await page.goto(`${base}/integrations/vercel`);
    await expect(page.getByRole("heading", { name: "Confirm your Vercel project" })).toBeVisible();
    await expect(page.getByText(userA.email, { exact: true })).toBeVisible();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    }
    const form = {
      csrf: token,
      project: "prj_testProject",
      domain: "origin-test.example",
      root: "public",
      confirm: "yes",
    };
    const csrf = await a.request.post(`${base}/integrations/vercel`, {
      form,
      headers: { Origin: "https://evil.example" },
      maxRedirects: 0,
    });
    expect(csrf.status()).toBe(403);
    const forged = await a.request.post(`${base}/integrations/vercel`, {
      form: { ...form, domain: "other.example" },
      headers: { Origin: base },
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(400);
    await b.addCookies([
      { name: "citefleet_vercel_origin", value: token, url: base, httpOnly: true, sameSite: "Lax" },
    ]);
    const stolen = await b.request.get(`${base}/integrations/vercel`);
    expect(stolen.status()).toBe(403);
    expect(await stolen.text()).not.toContain("origin-test-owner");
    let consentUrl: string | undefined;
    const cspErrors: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|form-action/i.test(message.text()))
        cspErrors.push(message.text());
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === "https://github.com" && url.pathname === "/login/oauth/authorize")
        consentUrl = url.href;
    });
    await page.getByLabel("Served static folder (repository-relative)").fill("public");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save project and install discovery files" }).click();
    await expect(page).toHaveURL(/^https:\/\/github\.com\//);
    await expect(page.getByRole("heading", { name: "Sign in to GitHub" })).toBeVisible();
    expect(consentUrl).toBeDefined();
    const authorize = new URL(consentUrl!);
    expect(authorize.searchParams.get("client_id")).toBe("local-origin-test");
    expect(authorize.searchParams.get("redirect_uri")).toBe(`${base}/api/oauth/github-callback`);
    expect(authorize.searchParams.get("scope")).toContain("repo");
    expect(authorize.searchParams.get("state")).toMatch(/^[a-f0-9]+$/);
    expect(cspErrors).toEqual([]);
    await page.goto(`${base}/integrations/vercel`);
    await expect(
      page.getByRole("heading", { name: "Installing and checking your website" }),
    ).toBeVisible();
    await expect(page.getByText("not verified live", { exact: true })).toHaveCount(5);
    const premature = await a.request.post(`${base}/integrations/vercel`, {
      form: { csrf: token, action: "complete" },
      headers: { Origin: base },
      maxRedirects: 0,
    });
    expect(premature.status()).toBe(409);
    expect(premature.headers()["set-cookie"]).toBeUndefined();
    const stored = (
      await pool.query("SELECT payload FROM citefleet_snapshot WHERE id=$1", [userA.workspace_id])
    ).rows[0].payload;
    const sites = stored.sites.filter(
      (s: { domain: string }) => s.domain === "origin-test.example",
    );
    expect(sites).toHaveLength(1);
    expect(sites[0].github).toMatchObject({
      owner: "origin-test-owner",
      repo: marker,
      branch: "main",
      root: "public",
    });
    expect(sites[0].billing).toBeUndefined();
    const replay = await a.request.post(`${base}/integrations/vercel`, {
      form,
      headers: { Origin: base },
      maxRedirects: 0,
    });
    expect([200, 409]).toContain(replay.status());
    const after = (
      await pool.query("SELECT payload FROM citefleet_snapshot WHERE id=$1", [userA.workspace_id])
    ).rows[0].payload;
    expect(
      after.sites.filter((s: { domain: string }) => s.domain === "origin-test.example"),
    ).toHaveLength(1);
    const other = (
      await pool.query("SELECT payload FROM citefleet_snapshot WHERE id=$1", [userB.workspace_id])
    ).rows[0].payload;
    expect(other.sites).toHaveLength(0);
    const cancel = await b.request.post(`${base}/integrations/vercel`, {
      form: { csrf: token, action: "cancel" },
      headers: { Origin: base },
      maxRedirects: 0,
    });
    expect(cancel.status()).toBe(303);
    expect(cancel.headers()["set-cookie"]).toContain("Max-Age=0");
    expect(
      (
        await pool.query(
          "SELECT user_id,site_id FROM citefleet_vercel_origin_installs WHERE token_hash=$1",
          [hash],
        )
      ).rows[0],
    ).toMatchObject({ user_id: userA.id, site_id: sites[0].id });
  } finally {
    await a.close();
    await b.close();
  }
});
test("email login resumes pending setup and expired state can be cancelled", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const user = await account(context, "resume");
    await context.clearCookies();
    const { token, hash } = await pending(context);
    const before = await context.request.get(`${base}/integrations/vercel`, { maxRedirects: 0 });
    expect(before.headers().location).toBe("/login");
    const page = await context.newPage();
    await page.route("http://localhost:4192/hostile", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<form method="post" action="${base}/api/login"><input name="email" value="${user.email}"><input name="password" value="${user.password}"><button>Submit hostile login</button></form>`,
      }),
    );
    await page.goto("http://localhost:4192/hostile");
    const refused = page.waitForResponse((response) => response.url() === `${base}/api/login`);
    await page.getByRole("button", { name: "Submit hostile login" }).click();
    expect((await refused).status()).toBe(403);
    expect(
      (
        await pool.query(
          "SELECT user_id FROM citefleet_vercel_origin_installs WHERE token_hash=$1",
          [hash],
        )
      ).rows[0].user_id,
    ).toBeNull();
    for (const endpoint of ["signup", "reset"]) {
      const denied = await context.request.post(`${base}/api/${endpoint}`, {
        form: { email: user.email, password: user.password },
        headers: { Origin: "http://localhost:4192", "Sec-Fetch-Site": "cross-site" },
      });
      expect(denied.status()).toBe(403);
      expect(denied.headers()["set-cookie"]).toBeUndefined();
    }
    await page.goto(`${base}/login`);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    const loginResponse = page.waitForResponse(
      (response) =>
        response.url() === `${base}/api/login` && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const loginResult = await loginResponse;
    expect(
      loginResult.status(),
      loginResult.status() === 303
        ? "login redirect"
        : `Origin=${loginResult.request().headers().origin}, Sec-Fetch-Site=${loginResult.request().headers()["sec-fetch-site"]}; ${await loginResult.text()}`,
    ).toBe(303);
    await expect(page).toHaveURL(`${base}/integrations/vercel`);
    await expect(page.getByRole("heading", { name: "Confirm your Vercel project" })).toBeVisible();
    await pool.query(
      "UPDATE citefleet_vercel_origin_installs SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE token_hash=$1",
      [hash],
    );
    const expired = await context.request.get(`${base}/integrations/vercel`);
    expect(expired.status()).toBe(403);
    const cancel = await context.request.post(`${base}/integrations/vercel`, {
      form: { csrf: token, action: "cancel" },
      headers: { Origin: base },
      maxRedirects: 0,
    });
    expect(cancel.status()).toBe(303);
    const reset = await context.request.get(`${base}/integrations/vercel`);
    expect(reset.status()).toBe(200);
    expect(await reset.text()).toContain("Connect your Vercel project");
  } finally {
    await context.close();
  }
});
