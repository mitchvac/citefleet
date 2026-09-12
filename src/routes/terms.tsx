import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | CiteFleet" },
      {
        name: "description",
        content: "The terms that apply when you create a CiteFleet account or use the service.",
      },
    ],
    links: [{ rel: "canonical", href: "https://citefleet.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <Shell eyebrow="Legal" title="Terms of Service">
      <article className="max-w-4xl text-sm leading-7 text-[#cfc8e8]">
        <p className="text-xs text-[#9b95b3]">Effective September 12, 2026</p>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-[#d9d3ee]">
          These Terms govern your access to CiteFleet. By creating an account or using the service,
          you agree to them and acknowledge the{" "}
          <Link to="/privacy" className="text-[#4ee0c3] underline underline-offset-4">
            Privacy Notice
          </Link>
          .
        </p>

        <TermsSection number="1" title="The service">
          <p>
            CiteFleet helps website owners and operators audit public origins, prepare indexing
            files, prove control, coordinate campaign tasks, publish a BotCentral site card, and
            monitor the resulting state. Features may change as the service develops.
          </p>
        </TermsSection>

        <TermsSection number="2" title="Accounts and eligibility">
          <p>
            You must be legally able to enter an agreement and provide accurate account information.
            You are responsible for safeguarding your credentials, limiting access to authorized
            people, and promptly reporting suspected account misuse. You may not share a reset link,
            session, provider token, or other secret with an unauthorized person.
          </p>
        </TermsSection>

        <TermsSection number="3" title="Your authority and instructions">
          <p>
            You represent that you have the rights and authority needed for every website, domain,
            repository, credential, file, and instruction you provide. You authorize CiteFleet to
            read public website and DNS data and, only when you request the action, to inspect or
            write an authorized repository, call a connected service, or publish a site listing and
            proof.
          </p>
          <p>
            Review generated files and proposed actions before publishing them. You remain
            responsible for your website content, legal notices, security configuration, and
            compliance duties.
          </p>
        </TermsSection>

        <TermsSection number="4" title="Acceptable use">
          <p>
            Do not use CiteFleet to access or alter a property without permission; misrepresent
            origin ownership; distribute malware or unlawful material; probe or disrupt the service;
            evade access, rate, or payment controls; extract another user's data; or violate law or
            another service's terms.
          </p>
        </TermsSection>

        <TermsSection number="5" title="Third-party services">
          <p>
            Google, GitHub, BotCentral, xAI, hosting providers, search engines, blockchains, and
            other connected services are operated by third parties. Their terms and privacy
            practices also apply to your use of them. CiteFleet is not responsible for a third
            party's availability, policy, content, ranking decision, transaction processing, or
            independent action.
          </p>
        </TermsSection>

        <TermsSection number="6" title="Charges and payment">
          <p>
            Some actions may require BotCentral API credit. The checkout screen identifies the
            amount, asset, destination, and credit before you pay. The current top-up flow does not
            create a recurring charge or store a payment card or wallet credential. Blockchain
            transactions may be irreversible, so verify the displayed payment details before sending
            funds.
          </p>
          <p>
            Contact the service operator promptly about a payment problem by replying to a CiteFleet
            account email. Nothing in these Terms limits a refund or consumer right that applicable
            law does not allow you to waive.
          </p>
        </TermsSection>

        <TermsSection number="7" title="Content and intellectual property">
          <p>
            You keep ownership of content, domains, and repositories you provide. You grant
            CiteFleet a limited permission to host, process, generate, and transmit that material
            only as needed to provide, secure, and support the service. CiteFleet and its licensors
            retain rights in the application, branding, software, and service materials.
          </p>
        </TermsSection>

        <TermsSection number="8" title="No outcome guarantee">
          <p>
            Audits and generated material are operational assistance, not legal, security, or search
            ranking advice. Search and answer engines control their own crawling, indexing, ranking,
            and citation decisions. CiteFleet does not guarantee publication, coverage, ranking,
            traffic, citations, revenue, uninterrupted operation, or error-free output.
          </p>
        </TermsSection>

        <TermsSection number="9" title="Suspension and termination">
          <p>
            You may stop using the service at any time. CiteFleet may limit or suspend access to
            protect users or infrastructure, investigate misuse, comply with law, address
            nonpayment, or enforce these Terms. Provisions that by their nature should continue,
            including ownership, disclaimers, and responsibility for prior actions, survive
            termination.
          </p>
        </TermsSection>

        <TermsSection number="10" title="Disclaimers and responsibility">
          <p>
            To the extent permitted by law, CiteFleet is provided "as is" and "as available" without
            implied warranties of merchantability, fitness for a particular purpose, or
            noninfringement. CiteFleet is not liable for indirect, incidental, special,
            consequential, or punitive loss arising from the service or a third-party system.
            Applicable law may give you rights that these exclusions cannot limit.
          </p>
        </TermsSection>

        <TermsSection number="11" title="Changes and contact">
          <p>
            We may update these Terms as the service or law changes. The effective date identifies
            the current version, and continued use after an update takes effect means you accept the
            revised Terms. For a question, reply to an account, verification, or password-recovery
            email sent by CiteFleet.
          </p>
        </TermsSection>
      </article>
    </Shell>
  );
}

function TermsSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 grid gap-3 border-t border-white/10 pt-7 sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-4">
      <p aria-hidden="true" className="mono text-xs text-[#4ee0c3]">
        {number.padStart(2, "0")}
      </p>
      <div>
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </section>
  );
}
