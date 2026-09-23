import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual page's effect with controlled hooks and a virtual clock.
// This catches dependency-triggered requests as well as overlapping timers.
const page = readFileSync(new URL("../../routes/topup.tsx", import.meta.url), "utf8");
const polling = ts.transpile(page.slice(page.indexOf("  // While the invoice is open"), page.indexOf("  async function open(")), { target: ts.ScriptTarget.ES2022 });
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function harness() {
  let invoice = { id: "invoice-a", status: "invoiced" };
  let previous: unknown[] | undefined;
  let cleanup: (() => void) | undefined;
  let clock = 0;
  let timerId = 0;
  const timers = new Map<number, { at: number; fn: () => void; repeat?: number }>();
  let calls = 0;
  let verify: () => Promise<typeof invoice> = async () => ({ ...invoice });
  let fetch: () => Promise<typeof invoice> = async () => ({ ...invoice });
  const schedule = (fn: () => void, delay: number, repeat?: number) => { const id = ++timerId; timers.set(id, { at: clock + delay, fn, repeat }); return id; };
  const render = () => runInNewContext(polling, {
    invoice, base: "https://catalog.example", POLL_MS: 6000,
    useEffect(fn: () => (() => void) | undefined, deps: unknown[]) {
      if (previous && deps.every((v, i) => Object.is(v, previous![i]))) return;
      cleanup?.(); previous = deps; cleanup = fn();
    },
    verifyTopupInvoice: () => { calls++; return verify(); }, fetchTopupInvoice: () => fetch(),
    setInvoice: (next: typeof invoice) => { invoice = next; render(); }, setAutomatic: () => {},
    window: { setTimeout: (fn: () => void, delay: number) => schedule(fn, delay), clearTimeout: (id: number) => timers.delete(id), setInterval: (fn: () => void, delay: number) => schedule(fn, delay, delay), clearInterval: (id: number) => timers.delete(id) },
  });
  return {
    render, calls: () => calls, invoice: () => invoice,
    verify: (fn: typeof verify) => { verify = fn; }, fetch: (fn: typeof fetch) => { fetch = fn; },
    stop: () => cleanup?.(),
    replace: (next: typeof invoice) => { invoice = next; render(); },
    async advance(ms: number) {
      clock += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= clock) {
        if (timer.repeat) timer.at = clock + timer.repeat; else timers.delete(id);
        timer.fn();
      }
      await flush();
    },
  };
}

test("an invoice response does not restart polling before six seconds", async () => {
  const h = harness();
  // Bound the reproduction so the broken effect cannot create an endless loop.
  h.verify(() => h.calls() <= 2 ? Promise.resolve({ id: "invoice-a", status: "invoiced" }) : new Promise(() => {}));
  h.render(); await flush();
  assert.equal(h.calls(), 1);
  await h.advance(5999); assert.equal(h.calls(), 1);
  await h.advance(1); assert.equal(h.calls(), 2);
  h.stop();
});

test("slow verification never overlaps and cleanup ignores late fallback responses", async () => {
  const h = harness();
  let reject!: (error: Error) => void;
  h.verify(() => new Promise((_, fail) => { reject = fail; }));
  let resolve!: (value: { id: string; status: string }) => void;
  h.fetch(() => new Promise((done) => { resolve = done; }));
  h.render(); await h.advance(12000);
  assert.equal(h.calls(), 1);
  reject(new Error("offline")); await flush();
  h.stop(); resolve({ id: "invoice-a", status: "paid" }); await flush();
  assert.equal(h.invoice().status, "invoiced");
});


test("a terminal invoice stops polling", async () => {
  const h = harness();
  h.verify(async () => ({ id: "invoice-a", status: "paid" }));
  h.render(); await flush();
  assert.equal(h.invoice().status, "paid");
  await h.advance(12000);
  assert.equal(h.calls(), 1);
});

test("a response for the previous invoice cannot replace the new invoice", async () => {
  const h = harness();
  let resolve!: (value: { id: string; status: string }) => void;
  h.verify(() => new Promise((done) => { resolve = done; }));
  h.render();
  h.replace({ id: "invoice-b", status: "paid" });
  resolve({ id: "invoice-a", status: "paid" }); await flush();
  assert.equal(h.invoice().id, "invoice-b");
  await h.advance(12000);
  assert.equal(h.calls(), 1);
});
