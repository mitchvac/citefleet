import { Link } from "@tanstack/react-router";
import { botcentralBase, MIN_TOPUP_USD, USD_PER_CALL } from "@/lib/citefleet/topup";

/**
 * What this payment is, who takes it, and what happens next.
 *
 * A page that shows a crypto address and asks a stranger to send money is the
 * shape of a scam page, whatever its intent, and both people and automated
 * review systems judge it that way. Every claim here is one the rest of the
 * codebase already makes good on: the price per call (CALL_PRICE_MICROS in
 * BotCentral), the operator-confirmed settlement (settleTopup, behind the spend
 * kill door), and the fact that nothing recurs — there is no stored payment
 * method anywhere in this system to charge again.
 *
 * Keep this honest. If a statement here stops being true, change the statement.
 */
export function PayTrust() {
  const base = botcentralBase().replace(/^https?:\/\//, "");
  return (
    <section className="glass mt-6 rounded-3xl p-6" data-testid="pay-trust">
      <h2 className="text-sm font-semibold text-white">
        Who takes this payment, and what happens next
      </h2>
      <dl className="mt-4 grid gap-4 text-sm leading-6 text-[#b7b0cc] sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
            Who you are paying
          </dt>
          <dd className="mt-1">
            CiteFleet, which runs billing for BotCentral API keys. The catalog itself is at{" "}
            <a href={botcentralBase()} className="text-[#4ee0c3] hover:underline" rel="noreferrer">
              {base}
            </a>
            . Both are operated by the same team.
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
            What you are buying
          </dt>
          <dd className="mt-1">
            Credit on one API key, at ${USD_PER_CALL.toFixed(2)} per call. The balance is drawn down
            as you use the API and stops when it runs out. Nothing recurs and nothing renews: there
            is no stored card or wallet in this system to charge a second time.
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
            How it is confirmed
          </dt>
          <dd className="mt-1">
            A person checks that the payment arrived and confirms it on this page. CiteFleet does
            not watch any blockchain and cannot see your transaction by itself, which is why
            confirmation is not instant.
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-[0.14em] text-[#9b95b3]">
            If something goes wrong
          </dt>
          <dd className="mt-1">
            Keep the invoice id shown above and your transaction hash. Together they identify the
            payment. An invoice you never pay simply expires and credits nothing; you are not billed
            for it and no reminder is sent.
          </dd>
        </div>
      </dl>
      <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-[#9b95b3]">
        The minimum is ${MIN_TOPUP_USD}. The quoted coin amount is fixed at the exchange rate when
        the invoice opens and expires with it, so a rate move does not change what you owe. Your key
        is identified by its <span className="mono">bc_live_</span> prefix only; the secret half of
        the key is never entered here and CiteFleet never asks for it.{" "}
        <Link
          to="/learn/$slug"
          params={{ slug: "botcentral" }}
          className="text-[#cfc8e8] hover:underline"
        >
          How listing and billing work
        </Link>
        .
      </p>
    </section>
  );
}
