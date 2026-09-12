import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
};

const checks = read(".github/workflows/checks.yml");
const schema = read(".github/workflows/supabase-migrations.yml");
const release = read(".github/workflows/release.yml");
const forcedCommand = read("deploy/ci-deploy-command.sh");
const dockerfile = read("Dockerfile");

test("pull-request checks are reusable and include the production build", () => {
  assert.match(checks, /workflow_call:/);
  assert.match(checks, /pull_request:/);
  assert.doesNotMatch(checks, /\n\s{2}push:/);
  assert.match(checks, /npm ci --ignore-scripts/);
  assert.match(checks, /npm run typecheck/);
  assert.match(checks, /npm run lint/);
  assert.match(checks, /npm test/);
  assert.match(checks, /npm run build/);
});

test("schema verification is reusable and never deploys by itself", () => {
  assert.match(schema, /workflow_call:/);
  assert.match(schema, /pull_request:/);
  assert.doesNotMatch(schema, /\n\s{2}push:/);
  assert.match(schema, /supabase db reset/);
  assert.match(schema, /supabase db lint --level warning/);
  assert.doesNotMatch(schema, /supabase db push/);
});

test("one release orders quality, schema, migration, and exact-SHA deploy", () => {
  assert.match(release, /push:\s*\n\s+branches: \[main\]/);
  assert.match(release, /cancel-in-progress: false/);
  assert.match(release, /quality:\s*\n\s+uses: \.\/\.github\/workflows\/checks\.yml/);
  assert.match(
    release,
    /schema:\s*\n\s+needs: quality\s*\n\s+uses: \.\/\.github\/workflows\/supabase-migrations\.yml/,
  );
  assert.match(release, /migrate:[\s\S]*?needs: schema[\s\S]*?supabase db push/);
  assert.match(
    release,
    /deploy:[\s\S]*?needs: migrate[\s\S]*?environment:\s*\n\s+name: production/,
  );
  assert.match(release, /ssh[\s\S]*?"deploy \$GITHUB_SHA"/);
  assert.match(release, /jq -e --arg revision "\$GITHUB_SHA"/);
});

test("release actions are first-party or the pinned Supabase CLI setup", () => {
  const uses = [...`${checks}\n${schema}\n${release}`.matchAll(/uses:\s*([^\s]+)/g)].map(
    ([, value]) => value,
  );
  assert.ok(uses.length > 0, "positive control: workflow actions found");
  for (const action of uses) {
    assert.ok(
      action.startsWith("./.github/workflows/") ||
        action.startsWith("actions/") ||
        action === "supabase/setup-cli@v3",
      `unexpected action: ${action}`,
    );
  }
});

test("the CI SSH key is constrained to an exact main commit deploy", () => {
  assert.match(forcedCommand, /SSH_ORIGINAL_COMMAND/);
  assert.match(forcedCommand, /\[0-9a-f\]\{40\}/);
  assert.match(forcedCommand, /origin\/main/);
  assert.match(forcedCommand, /CITEFLEET_DEPLOY_REVISION/);
  assert.doesNotMatch(forcedCommand, /eval/);
});

test("Docker installs exactly the committed dependency graph", () => {
  assert.match(dockerfile, /RUN npm ci --ignore-scripts/);
  assert.doesNotMatch(dockerfile, /RUN npm install --ignore-scripts/);
});
