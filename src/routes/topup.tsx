import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AssetPicker } from "@/components/citefleet/AssetPicker";
import { PayQr } from "@/components/citefleet/PayQr";
import { PayTrust } from "@/components/citefleet/PayTrust";
import { Shell } from "@/components/citefleet/Shell";
import { settleTopupFn } from "@/lib/citefleet/fleet-api";
import {
  botcentralBase,
  clampTopupUsd,
  MAX_TOPUP_USD,
  MIN_TOPUP_USD,
  USD_PER_CALL,
  fetchTopupInvoice,
  openTopupInvoice,
  parseTopupSearch,
  payInstructions,
  type TopupAsset,
  type TopupInvoice,
} from "@/lib/citefleet/topup";

type RawSearch = { prefix?: string; jobs?: string; usd?: string; asset?: string; job?: string };

const str = (v: unknown) =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

export const Route = createFileRoute("/topup")({
  validateSearch: (s: Record<string, unknown>): RawSearch => ({
    prefix: str(s.prefix),
    jobs: str(s.jobs),
    usd: str(s.usd),
    asset: str(s.asset),
    job: str(s.job),
  }),
  component: TopupPage,
});

const POLL_MS = 20_000;

function TopupPage() {
  const raw = Route.useSearch();
  const navigate = useNavigate({ from: "/topup" });
  const parsed = useMemo(() => parseTopupSearch(raw), [raw]);
  const base = botcentralBase();
  const [prefix, setPrefix] = useState(parsed.prefix);
  const [usd, setUsd] = useState(String(parsed.usd));
  const [asset, setAsset] = useState<TopupAsset>(parsed.asset);
  const [invoice, setInvoice] = useState<TopupInvoice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState("");
  const [settleError, setSettleError] = useState("");
  const [settleBusy, setSettleBusy] = useState(false);

  // An invoice id in the URL (BotCentral's invoice link, or a reload) reloads that invoice.
  useEffect(() => {
    if (!parsed.job) return;
    let cancelled = false;
    fetchTopupInvoice(base, parsed.job)
      .then((next) => {
        if (cancelled) return;
        setInvoice(next);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the invoice");
      });
    return () => {
      cancelled = true;
    };
  }, [base, parsed.job]);

  // While the invoice is open, watch for the operator's settlement.
  useEffect(() => {
    if (!invoice || invoice.status !== "invoiced") return;
    const timer = window.setInterval(() => {
      fetchTopupInvoice(base, invoice.id)
        .then((next) => setInvoice(next))
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [base, invoice]);

  async function open(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await openTopupInvoice(base, { asset, usd: clampTopupUsd(usd), prefix });
      setInvoice(next);
      setTx("");
      setSettleError("");
      void navigate({ search: { prefix: prefix || undefined, job: next.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the invoice");
    } finally {
      setBusy(false);
    }
  }

  async function settle(event: FormEvent) {
    event.preventDefault();
    if (!invoice) return;
    setSettleBusy(true);
    setSettleError("");
    try {
      setInvoice(
        await settleTopupFn({ data: { id: invoice.id, tx, prefix: prefix || undefined } }),
      );
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : "Could not confirm the payment");
    } finally {
      setSettleBusy(false);
    }
  }

  const lines = invoice ? payInstructions(invoice) : [];
  const paid = invoice ? invoice.status === "paid" || invoice.status === "done" : false;
  const needsSignIn = /^Unauthorized/i.test(settleError);

  return (
    <Shell eyebrow="BotCentral billing" title="Top up a BotCentral API key">
      <p className="-mt-6 mb-8 max-w-2xl text-sm leading-6 text-[#b7b0cc]">
        Every BotCentral job run is $1.00, paid in RLUSD, XRP, XLM, BTC, HBAR, or XDC. Open an
        invoice for your <span className="mono">bc_live_</span> key prefix, pay the quoted amount,
        and a CiteFleet operator confirms the payment here. BotCentral then credits the prefix. Mint
        a key at{" "}
        <a href={`${base}/keys`} className="text-[#4ee0c3] hover:underline" rel="noreferrer">
          {base.replace(/^https?:\/\//, "")}/keys
        </a>
        .
      </p>

      <form
        onSubmit={open}
        className="glass relative z-20 grid gap-4 rounded-3xl p-6 md:grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1fr)_auto] md:items-end"
      >
        <label className="block text-sm text-[#cfc8e8]">
          Key prefix
          <input
            name="prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.trim())}
            placeholder="bc_live_…"
            className="mono mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-sm text-[#cfc8e8]">
          Amount (USD)
          <div className="mono mt-2 flex items-center rounded-xl border border-white/10 bg-white/5 px-3 focus-within:border-[#9b7dff]">
            <span className="text-sm text-[#9b95b3]">$</span>
            <input
              name="usd"
              type="number"
              inputMode="decimal"
              min={MIN_TOPUP_USD}
              max={MAX_TOPUP_USD}
              step="0.01"
              value={usd}
              onChange={(e) => setUsd(e.target.value)}
              onBlur={() => setUsd(String(clampTopupUsd(usd)))}
              className="mono w-full bg-transparent px-2 py-2 text-sm text-white outline-none"
            />
          </div>
        </label>
        <div className="block text-sm text-[#cfc8e8]">
          Pay with
          <AssetPicker value={asset} onChange={setAsset} />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="btn-light rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Opening…" : "Add credit"}
        </button>
        <div className="flex flex-wrap items-center gap-2 md:col-span-4">
          {[5, 10, 25, 50, 100].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => setUsd(String(amount))}
              className={`rounded-full border px-3 py-1 text-xs ${
                Number(usd) === amount
                  ? "border-[#9b7dff]/60 bg-[#9b7dff]/15 text-white"
                  : "border-white/10 text-[#cfc8e8] hover:bg-white/5"
              }`}
            >
              ${amount}
            </button>
          ))}
          <span className="text-xs text-[#9b95b3]">
            {`Minimum $${MIN_TOPUP_USD}. Buys about ${Math.floor(clampTopupUsd(usd) / USD_PER_CALL)} calls at $${USD_PER_CALL.toFixed(2)} each; the balance is drawn down as you use it.`}
          </span>
        </div>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}

      {invoice ? (
        <section className="glass mt-6 rounded-3xl p-6">
          <p className="mono text-[11px] uppercase tracking-[0.18em] text-[#e2c36d]">
            Invoice {invoice.status}
          </p>
          <p className="mono mt-2 text-sm text-white">{invoice.id}</p>
          <p className="mt-2 text-sm text-[#cfc8e8]">
            {invoice.jobs} job{invoice.jobs === 1 ? "" : "s"} · ${invoice.usd} ·{" "}
            {invoice.pay.amount} {invoice.pay.ticker} on {invoice.pay.network_name}
            {prefix ? (
              <>
                {" "}
                · credits <span className="mono">{prefix}</span>
              </>
            ) : (
              " · no key prefix given"
            )}
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-[#cfc8e8]">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {/* Scan-to-pay: renders only when BotCentral bound a treasury address for the network. */}
          {!paid && <PayQr invoice={invoice} />}
          {paid ? (
            <p className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              Payment confirmed. BotCentral has credited {invoice.jobs} job
              {invoice.jobs === 1 ? "" : "s"}
              {prefix ? ` to ${prefix}` : ""}. Check the key on{" "}
              <a href={`${base}/keys`} className="underline" rel="noreferrer">
                BotCentral
              </a>
              .
            </p>
          ) : (
            <form
              onSubmit={settle}
              className="mt-6 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
            >
              <label className="block text-sm text-[#cfc8e8]">
                Operator: transaction hash or receipt reference
                <input
                  name="tx"
                  value={tx}
                  onChange={(e) => setTx(e.target.value)}
                  placeholder="Paste the hash once the payment has landed"
                  className="mono mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="submit"
                disabled={settleBusy || tx.trim().length < 4}
                className="rounded-full border border-white/10 px-5 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                {settleBusy ? "Confirming…" : "Confirm payment received"}
              </button>
              <p className="text-xs text-[#9b95b3] md:col-span-2">
                Operators only. This does not check a chain; it records that you verified the
                payment and asks BotCentral to credit the prefix. Frozen while the spend door is
                killed on Monitor.
              </p>
              {settleError ? (
                <p className="text-sm text-rose-200 md:col-span-2">
                  {settleError}
                  {needsSignIn ? (
                    <>
                      {" "}
                      <Link to="/login" className="underline">
                        Sign in as an operator
                      </Link>
                      , then reopen this invoice.
                    </>
                  ) : null}
                </p>
              ) : null}
            </form>
          )}
        </section>
      ) : (
        <p className="glass mt-6 rounded-3xl p-6 text-sm text-[#b7b0cc]">
          No invoice open yet. Fill in the key prefix and job count, then open one. Reloading an
          invoice link (<span className="mono">?job=bj_…</span>) shows its live status.
        </p>
      )}

      <PayTrust />

      <p className="mt-8 text-sm text-[#9b95b3]">
        <Link to="/learn/$slug" params={{ slug: "botcentral" }} className="hover:text-white">
          ← Lesson 11: BotCentral listing
        </Link>
      </p>
    </Shell>
  );
}
