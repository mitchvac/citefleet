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
