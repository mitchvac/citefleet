/**
 * Operator-only settlement of a BotCentral top-up invoice (server-only).
 *
 * CiteFleet does not watch any chain. The operator confirms that payment
 * arrived (out of band today, since BotCentral binds no treasury address) and
 * enters the transaction hash or receipt reference; BotCentral trusts the
 * service token, marks the invoice paid, and credits the bc_live_ prefix.
 * Behind the `spend` kill door: freezing spend on Monitor refuses this.
 */
import { assertCanAct } from "./control";
import { getStore, logActivity, mutateStore } from "./store";
import { settleRequestBody, type TopupInvoice } from "./topup";

const DEFAULT_URL = "https://botcentral.org";
const FETCH_UA = "CiteFleetPublisher/1.0 (+https://citefleet.app)";

function catalogUrl() {
  return (process.env.BOTCENTRAL_URL || DEFAULT_URL).replace(/\/+$/, "");
}

function serviceToken() {
  return process.env.BOTCENTRAL_SERVICE_TOKEN?.trim() || "";
}

export async function settleTopup(input: { id?: unknown; tx?: unknown; prefix?: unknown }): Promise<TopupInvoice> {
  const body = settleRequestBody(input);
  assertCanAct(await getStore(), "spend");
  if (serviceToken().length < 16) {
    throw new Error("BOTCENTRAL_SERVICE_TOKEN missing on CiteFleet");
  }
  const res = await fetch(`${catalogUrl()}/internal/jobs/settle`, {
    method: "POST",
    headers: {
      "User-Agent": FETCH_UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceToken()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string; invoice?: TopupInvoice };
  if (!res.ok || !payload.invoice) {
    throw new Error(payload.error || `settle ${res.status}`);
  }
  const invoice = payload.invoice;
  await mutateStore((store) =>
    logActivity(store, {
      actor: "operator",
      kind: "system",
      message: `Settled BotCentral invoice ${invoice.id}: ${invoice.jobs} job${invoice.jobs === 1 ? "" : "s"} ($${invoice.usd}) ${body.prefix ? `credited to ${body.prefix}` : "with no key prefix"}; receipt ${body.tx}`,
    }),
  );
  return invoice;
}
