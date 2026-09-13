export const MAX_WEBHOOK_BODY_BYTES = 8 * 1024 * 1024;
// GitHub's published delivery cap is 25 MB. Matching it here prevents this
// safety reader from rejecting a push payload GitHub considers deliverable.
export const MAX_GITHUB_WEBHOOK_BODY_BYTES = 25 * 1024 * 1024;

export type WebhookBodyResult =
  { ok: true; rawBody: string } | { ok: false; status: 400 | 413; error: string };

type BodyRequest = Pick<Request, "body" | "headers">;

function invalidBody(): WebhookBodyResult {
  return { ok: false, status: 400, error: "Invalid webhook request body." };
}

function oversizedBody(): WebhookBodyResult {
  return { ok: false, status: 413, error: "Webhook request body exceeds 8 MB." };
}

export async function readWebhookBody(
  request: BodyRequest,
  maxBytes = MAX_WEBHOOK_BODY_BYTES,
): Promise<WebhookBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return invalidBody();
    if (BigInt(contentLength) > BigInt(maxBytes)) return oversizedBody();
  }

  if (!request.body) return { ok: true, rawBody: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return oversizedBody();
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    return invalidBody();
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      ok: true,
      rawBody: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    };
  } catch {
    return invalidBody();
  }
}
