import assert from "node:assert/strict";
import { test } from "node:test";
import { copyText } from "./clipboard.ts";

// The values this carries — a DNS record and the contents of five files — ARE
// the deliverable. A customer who cannot get them out of the page cannot finish,
// so "the clipboard refused" must never be a button that silently did nothing.

test("the clipboard takes it", async () => {
  const written: string[] = [];
  const outcome = await copyText("botcentral-verify=citefleet-app", {
    write: async (t) => {
      written.push(t);
    },
    prompt: () => null,
  });
  assert.equal(outcome, "copied");
  assert.deepEqual(written, ["botcentral-verify=citefleet-app"]);
});

test("a blocked clipboard falls through to a prompt, not to silence", async () => {
  // Insecure context (http://) or a denied permission — common on the exact
  // self-hosted setups this feature is for.
  const prompted: Array<[string, string]> = [];
  const outcome = await copyText(
    "value",
    {
      write: async () => {
        throw new Error("NotAllowedError");
      },
      prompt: (m, v) => {
        prompted.push([m, v]);
        return v;
      },
    },
    "Copy the DNS record",
  );
  assert.equal(outcome, "prompted");
  assert.deepEqual(prompted, [["Copy the DNS record", "value"]]);
});

test("no clipboard at all still reaches the prompt", async () => {
  let seen = "";
  const outcome = await copyText("value", {
    write: null,
    prompt: (_m, v) => {
      seen = v;
      return v;
    },
  });
  assert.equal(outcome, "prompted");
  assert.equal(seen, "value");
});

test("neither door is reported as unavailable, never as success", async () => {
  // The caller must keep the value on screen. Claiming "Copied" here would be a
  // lie the customer only discovers when they paste nothing.
  assert.equal(await copyText("value", { write: null, prompt: null }), "unavailable");
});

test("a prompt the person cancels is still a successful hand-off", async () => {
  // window.prompt returns null on cancel. The value WAS shown and selectable;
  // whether they took it is not something the page can know.
  assert.equal(
    await copyText("value", { write: null, prompt: () => null }),
    "prompted",
  );
});
