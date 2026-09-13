import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  MAX_GITHUB_WEBHOOK_BODY_BYTES,
  readWebhookBody,
  type WebhookBodyResult,
} from "./webhook-body.server.ts";

function requestBody(
  chunks: Array<Uint8Array<ArrayBuffer>>,
  headers: HeadersInit = {},
): Pick<Request, "body" | "headers"> {
  return {
    headers: new Headers(headers),
    body: new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
  };
}

function failureStatus(result: WebhookBodyResult): 400 | 413 {
  if (result.ok) assert.fail("expected the webhook body to be rejected");
  return result.status;
}

test("reads the exact UTF-8 body used by webhook signature verification", async () => {
  const rawBody = '\uFEFF{"domain":"café.example"}';
  const encoded = new TextEncoder().encode(rawBody);
  const result = await readWebhookBody(
    requestBody([encoded], { "content-length": String(encoded.byteLength) }),
  );
  assert.deepEqual(result, { ok: true, rawBody });
});

test("rejects a declared body over the production limit without reading it", async () => {
  let opened = false;
  const body = {
    getReader() {
      opened = true;
      throw new Error("body must not be read");
    },
  } as unknown as ReadableStream<Uint8Array<ArrayBuffer>>;
  const result = await readWebhookBody({
    headers: new Headers({ "content-length": "8388609" }),
    body,
  });
  assert.deepEqual(result, {
    ok: false,
    status: 413,
    error: "Webhook request body exceeds 8 MB.",
  });
  assert.equal(opened, false);
});

test("counts streamed UTF-8 bytes rather than JavaScript characters", async () => {
  const encoded = new TextEncoder().encode("é");
  assert.deepEqual(await readWebhookBody(requestBody([encoded]), 1), {
    ok: false,
    status: 413,
    error: "Webhook request body exceeds 8 MB.",
  });
  assert.deepEqual(await readWebhookBody(requestBody([encoded]), 2), {
    ok: true,
    rawBody: "é",
  });
});

test("rejects malformed lengths, invalid UTF-8, and failed streams", async () => {
  assert.equal(
    failureStatus(await readWebhookBody(requestBody([], { "content-length": "8mb" }))),
    400,
  );
  assert.equal(
    failureStatus(await readWebhookBody(requestBody([new Uint8Array([0xc3, 0x28])]))),
    400,
  );
  assert.equal(
    failureStatus(
      await readWebhookBody({
        headers: new Headers(),
        body: new ReadableStream({
          pull(controller) {
            controller.error(new Error("socket failed"));
          },
        }),
      }),
    ),
    400,
  );
});

test("every public webhook route uses the bounded reader", async () => {
  assert.equal(MAX_GITHUB_WEBHOOK_BODY_BYTES, 25 * 1024 * 1024);
  for (const route of ["github", "deployed", "botcentral", "entri"]) {
    const source = await readFile(
      new URL(`../../routes/api/hooks/${route}.ts`, import.meta.url),
      "utf8",
    );
    assert.match(source, /readWebhookBody\(request/, route);
    assert.doesNotMatch(source, /request\.text\(\)/, route);
    if (route === "github") {
      assert.match(source, /readWebhookBody\(request, MAX_GITHUB_WEBHOOK_BODY_BYTES\)/);
    } else {
      assert.match(source, /readWebhookBody\(request\)/);
    }
  }
});
