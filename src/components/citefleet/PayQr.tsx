import { useMemo, useState } from "react";
import { encodeQr, qrSvgPath } from "@/lib/citefleet/qr";
import { payTarget } from "@/lib/citefleet/pay-uri";
import type { TopupInvoice } from "@/lib/citefleet/topup";

/**
 * Scan-to-pay panel for an open invoice: the QR, the address, the amount, and
 * the destination tag or memo, each copyable. Renders nothing when BotCentral
 * bound no treasury address for the network — there is no destination to encode,
 * and the page's existing "pay out of band" note covers that case honestly.
 */
function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false); // clipboard blocked (insecure context / denied permission)
        }
      }}
      className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-[#cfc8e8] hover:bg-white/5"
      aria-label={`Copy ${label}`}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 py-2 first:border-t-0">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={`${mono ? "mono" : ""} truncate text-sm text-white`} title={value}>
          {value}
        </span>
        <Copy label={label} value={value} />
      </span>
    </div>
  );
}

export function PayQr({ invoice }: { invoice: TopupInvoice }) {
  const target = useMemo(() => payTarget(invoice), [invoice]);
  const qr = useMemo(() => {
    if (!target) return null;
    try {
      return encodeQr(target.qr);
    } catch {
      return null; // payload beyond version 10; the copyable rows below still work
    }
  }, [target]);
  if (!target) return null;

  const span = qr ? qr.size + 4 : 0;
  return (
    <section className="mt-6 grid gap-6 border-t border-white/10 pt-6 sm:grid-cols-[auto_minmax(0,1fr)]" data-testid="pay-qr">
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          <svg
            viewBox={`0 0 ${span} ${span}`}
            width={200}
            height={200}
            role="img"
            aria-label={`Payment QR code for ${target.address}`}
            data-testid="pay-qr-svg"
            className="rounded-xl bg-white p-0"
            shapeRendering="crispEdges"
          >
            <rect width={span} height={span} fill="#ffffff" />
            <path d={qrSvgPath(qr, 2)} fill="#07060f" />
          </svg>
        ) : (
          <p className="text-xs text-[#9b95b3]">This address is too long to encode as a QR; copy it below.</p>
        )}
        <p className="text-[11px] text-[#9b95b3]">
          {target.isUri ? "Scan with your wallet" : `Scan for the address · ${target.networkName}`}
        </p>
      </div>
      <div>
        <Row label={`${target.ticker} amount`} value={target.amount} />
        <Row label="Address" value={target.address} />
        {target.matchingValue && <Row label={target.matchingLabel} value={target.matchingValue} />}
        {target.issuer && <Row label="Issuer" value={target.issuer} />}
        {target.warning && (
          <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100" data-testid="pay-qr-warning">
            {target.warning}
          </p>
        )}
      </div>
    </section>
  );
}
