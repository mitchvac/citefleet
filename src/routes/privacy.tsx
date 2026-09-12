import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice | CiteFleet" },
      {
        name: "description",
        content:
          "How CiteFleet collects, uses, shares, protects, and retains account and website operations data.",
      },
    ],
    links: [{ rel: "canonical", href: "https://citefleet.app/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <Shell eyebrow="Legal" title="Privacy Notice">
      <article className="max-w-4xl text-sm leading-7 text-[#cfc8e8]">
        <p className="text-xs text-[#9b95b3]">Effective September 12, 2026</p>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-[#d9d3ee]">
          This notice explains how CiteFleet handles information when you create an account, operate
          a website workspace, connect another service, or use citefleet.app.
        </p>

        <PolicySection title="Who is responsible and how to contact us">
          <p>
            CiteFleet operates the CiteFleet service. For a privacy question or request, reply to an
            account, verification, or password-recovery email sent by CiteFleet. That reply reaches
            the configured service operator.
          </p>
        </PolicySection>

        <PolicySection title="Information we handle">
          <ul className="list-disc space-y-2 pl-5 marker:text-[#4ee0c3]">
            <li>
              Account information such as your name, email address, profile image, provider account
              identifier, password hash, and sign-in method.
            </li>
            <li>
              Security information such as session identifiers, request IP addresses, failed sign-in
              state, OAuth state, and password-reset records.
            </li>
            <li>
              Workspace information such as site names and domains, repository locations, hosting
              choices, IndexNow configuration, BotCentral key prefixes, webhook settings, task
              state, generated files, and audit history.
            </li>
            <li>
              Public website observations such as pages, sitemaps, DNS records, response headers,
              origin proof, and indexing or listing status.
            </li>
            <li>
              Integration and payment information returned or submitted during an authorized action,
              such as an invoice identifier, asset, amount, destination, transaction reference, or
              integration access token.
            </li>
          </ul>
        </PolicySection>

        <PolicySection title="Why we use it">
          <p>
            We use this information to create and secure accounts; provide audits, origin files,
            monitoring, listings, training, and support; carry out actions you request; prevent
            abuse; troubleshoot and improve the service; keep operational records; and comply with
            law.
          </p>
          <p>
            Where privacy law requires a legal basis, processing may be necessary to provide the
            service or take requested pre-contract steps, to meet legal obligations, for legitimate
            interests in operating and securing the service, or with consent where required.
          </p>
        </PolicySection>

        <PolicySection title="Services we use and information we disclose">
          <p>
            We disclose information only as needed to operate the service, complete an action you
            request, protect users and the service, or meet a legal obligation. Recipients may
            include infrastructure, database, and email providers, as well as these optional
            integrations:
          </p>
          <ul className="list-disc space-y-2 pl-5 marker:text-[#4ee0c3]">
            <li>
              <ExternalLink href="https://policies.google.com/privacy">Google</ExternalLink> or{" "}
              <ExternalLink href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">
                GitHub
              </ExternalLink>{" "}
              when you use provider sign-in.
            </li>
            <li>GitHub when you authorize repository inspection or an origin-file write.</li>
            <li>
              BotCentral when you request listing, verification, API credit, or payment processing.
              Published site cards and proof are public.
            </li>
            <li>
              <ExternalLink href="https://x.ai/legal/privacy-policy">xAI</ExternalLink> when you
              invoke a Grok specialist for a campaign task.
            </li>
          </ul>
          <p>
            Information committed to a repository or published to BotCentral may remain in public or
            third-party copies after it leaves CiteFleet.
          </p>
        </PolicySection>

        <PolicySection title="Cookies and similar storage">
          <p>
            CiteFleet uses necessary cookies for sign-in sessions and temporary OAuth state. These
            cookies keep an account signed in, protect provider callbacks, and enforce access. The
            embedded app preview may instead keep a temporary bearer token in browser session
            storage when normal cookies cannot reach the preview. The current product does not use
            advertising cookies.
          </p>
        </PolicySection>

        <PolicySection title="Retention and security">
          <p>
            We retain account and workspace information while the service is active and as
            reasonably needed for security, recovery, support, legal compliance, and dispute
            handling. Password reset links are single-use and expire after 30 minutes; related
            security records may be retained briefly to prevent abuse. Public listings and
            repository history follow the retention practices of the service where they were
            published.
          </p>
          <p>
            CiteFleet uses access controls, hashed passwords and reset tokens, transport encryption,
            secret masking, and other technical and organizational safeguards. No internet service
            can promise absolute security.
          </p>
        </PolicySection>

        <PolicySection title="Your choices and rights">
          <p>
            Depending on where you live, you may have rights to access, correct, delete, restrict,
            or export personal information, object to certain processing, or withdraw consent. You
            may also complain to your local privacy or data-protection authority. Reply to a
            CiteFleet account email to make a request. We may need to verify your identity before
            acting.
          </p>
        </PolicySection>

        <PolicySection title="Children, international processing, and changes">
          <p>
            CiteFleet is a business service intended for adults and is not directed to children
            under 13. Service providers may process information in countries other than your own,
            subject to safeguards required by applicable law. We may update this notice as the
            product or law changes; the effective date above identifies the current version.
          </p>
        </PolicySection>
      </article>
    </Shell>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-white/10 pt-7">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[#4ee0c3] underline underline-offset-4 hover:text-[#79ead3]"
    >
      {children}
    </a>
  );
}
