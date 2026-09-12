import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const deploy = readFileSync(new URL("../deploy/deploy-vps.sh", import.meta.url), "utf8");
const workspaceIds = readFileSync(
  new URL("../src/lib/citefleet/workspace-id.ts", import.meta.url),
  "utf8",
);

test("the production break-glass token is pinned to the codebase root workspace", () => {
  const root = workspaceIds.match(/ROOT_WORKSPACE_ID = "([^"]+)"/);
  assert.ok(root, "positive control: ROOT_WORKSPACE_ID found");
  assert.match(
    deploy,
    new RegExp(`CITEFLEET_BREAK_GLASS_WORKSPACE=${root[1]}`),
    "a deployed break-glass session must resolve to the existing root workspace",
  );
});

test("a deployment publishes and verifies the exact checked-out revision", () => {
  assert.match(deploy, /CITEFLEET_DEPLOY_REVISION/);
  assert.match(deploy, /CITEFLEET_REVISION=%s/);
  assert.match(deploy, /git rev-parse --verify HEAD/);
  assert.match(deploy, /public_healthy\(\)[\s\S]*?revision[\s\S]*?\$REVISION/);
});

test("a candidate is healthy before cutover and the prior container is the rollback", () => {
  assert.match(deploy, /CANDIDATE="\$\{CONTAINER\}-candidate"/);
  assert.match(deploy, /ROLLBACK="\$\{CONTAINER\}-rollback"/);
  assert.match(deploy, /if ! docker run -d[\s\S]*?--name "\$CANDIDATE"/);
  assert.match(deploy, /candidate failed to start; live container was not touched/);
  assert.match(deploy, /rollback_healthy\(\)/);
  assert.match(deploy, /rollback failed to recover the prior service/);
  assert.match(deploy, /ROLLBACK COMPLETE/);
  assert.match(deploy, /exit 1/);
});

test("the deploy verifies public entry points before discarding rollback", () => {
  assert.match(deploy, /public_healthy\(\)[\s\S]*?\/login/);
  assert.match(deploy, /public_healthy\(\)[\s\S]*?\/api\/oauth\/providers/);
  assert.match(deploy, /public_healthy\(\)[\s\S]*?content-security-policy/i);
  assert.match(
    deploy,
    /if \[\[ "\$HAD_ROLLBACK" == 1 \]\]; then\s+docker rm -f "\$ROLLBACK"/,
  );
});
