import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/docs/integrations/vercel")({
  head: () => ({
    meta: [
      { title: "CiteFleet Origin for Vercel | Documentation" },
      {
        name: "description",
        content:
          "Prepare crawler discovery files, deploy them through your GitHub-connected Vercel project, verify domain ownership, and understand BotCentral listing charges.",
      },
    ],
    links: [{ rel: "canonical", href: "https://citefleet.app/docs/integrations/vercel" }],
  }),
  component: VercelGuide,
});

const FILES = [
  [
    "/robots.txt",
    "Crawler access instructions. Review the generated rules against your site's consent and access choices.",
  ],
  [
    "/sitemap.xml",
    "Public page URLs. Preserve an existing framework or CMS sitemap when it already owns this path.",
  ],
  ["/llms.txt", "A plain-text overview and links for automated readers."],
  [
    "/.well-known/botcentral.txt",
    "BotCentral domain proof and catalog pointers using this property's exact token.",
  ],
  [
    "/<your-indexnow-key>.txt",
    "IndexNow verification: the filename and its contents use the property's key. Included when a valid key is configured.",
  ],
];
const link = "text-[#4ee0c3] underline underline-offset-4 break-words";
const section = "mt-10 space-y-4 border-t border-white/10 pt-7";
const heading = "text-xl font-semibold text-white";

function VercelGuide() {
  return (
    <Shell eyebrow="Documentation" title="CiteFleet Origin for Vercel">
      <article className="max-w-3xl min-w-0 text-base leading-7 text-[#cfc8e8]">
        <p className="text-lg">
          Prepare discovery files in CiteFleet, publish them through your website's repository, and
          check the result on your Vercel production domain.
        </p>
        <aside
          className="mt-6 border-l-2 border-[#4ee0c3] pl-4"
          aria-label="Supported installation method"
        >
          <strong className="text-white">Connect Vercel, then authorize GitHub writes.</strong> The{" "}
          <a className={link} href="/integrations/vercel">
            Vercel setup flow
          </a>{" "}
          lets you confirm an authorized GitHub-connected project, production domain, branch and
          served folder. Integration credentials must be configured before Vercel authorization can
          complete. CiteFleet's separate Vercel DNS connection handles ownership TXT records; it
          does not install files.
        </aside>
        <section className={section}>
          <h2 className={heading}>Before you start</h2>
          <p>
            You need a CiteFleet account, authority to manage the website, and access to the GitHub
            repository and branch deployed by your Vercel project. Confirm the project's root
            directory, production branch, custom domain and static-file location before authorizing
            a write.
          </p>
          <p>
            For a framework that serves files from <code>public/</code>, use that folder. A monorepo
            may need a path such as <code>frontend/public</code>. These are examples: use your
            project's actual layout.
          </p>
        </section>
        <section className={section}>
          <h2 className={heading}>Install from Vercel</h2>
          <ol className="list-decimal space-y-3 pl-6">
            <li>
              Open CiteFleet Origin in Vercel and authorize the projects you manage. Choose at most
              20 projects. The setup supports GitHub-connected projects with verified production
              domains.
            </li>
            <li>
              Sign in to CiteFleet in the same browser. Review the account, project, domain and
              repository shown. Enter the actual served static folder; if Vercel does not report the
              production branch, confirm it from your project settings.
            </li>
            <li>
              Confirm that you started this installation, then save the project. This creates or
              updates the domain's property in your own CiteFleet workspace.
            </li>
            <li>
              Choose <strong>Connect GitHub and install discovery files</strong>. Review GitHub's
              authorization. This can commit files to the production branch; existing file ownership
              and repository-folder checks still apply.
            </li>
            <li>
              Inspect the campaign and Vercel deployment, verify the live file contents, then return
              to the setup tab and choose <strong>Finish connection and return to Vercel</strong>.
              Finishing the connection is not proof that a deployment succeeded.
            </li>
          </ol>
          <p>
            The setup session expires after 30 minutes. Vercel credentials are used transiently to
            read installation and project metadata and are not retained. GitHub authorization is
            retained for future file updates. No BotCentral purchase or listing is triggered by this
            setup.
          </p>
          <p>
            If the callback reports that setup is not configured, the integration operator must
            configure its Vercel credentials first. If your project is not GitHub-connected, use the
            manual workflow below.
          </p>
        </section>
        <section className={section}>
          <h2 className={heading}>The discovery files</h2>
          <dl className="space-y-4">
            {FILES.map(([path, description]) => (
              <div key={path}>
                <dt className="break-all font-mono text-sm text-white">{path}</dt>
                <dd className="mt-1">{description}</dd>
              </div>
            ))}
          </dl>
          <p>
            These are public URL paths, not five files to upload to the Vercel dashboard. CiteFleet
            generates four core files and an additional IndexNow file when a valid key exists.
            Review the contents before publishing; discovery files do not guarantee crawling,
            ranking or citations.
          </p>
        </section>
        <section className={section}>
          <h2 className={heading}>Install through GitHub and deploy</h2>
          <ol className="list-decimal space-y-3 pl-6">
            <li>
              <a className={link} href="/login">
                Sign in to CiteFleet
              </a>
              , add your website, and open its campaign.
            </li>
            <li>
              In <strong>Origin files → GitHub</strong>, enter the correct owner, repository, branch
              and folder. Save the repository details.
            </li>
            <li>
              Select <strong>Connect GitHub and install 5 files</strong> and review GitHub's
              requested access. This action can commit files to the selected branch. CiteFleet
              checks existing paths and refuses files it cannot safely own; resolve conflicts rather
              than overwriting existing site content.
            </li>
            <li>
              Check the resulting commit and your Vercel deployment. With automatic Git deployments
              enabled, Vercel builds the connected branch; a preview deployment does not by itself
              update production. Follow your normal review and production-promotion process.
            </li>
            <li>
              After the production deployment is ready, run CiteFleet's live audit and file checks
              against your custom domain.
            </li>
          </ol>
          <p>
            For manual setup, open <strong>The files bots read → Show files → Download</strong>.
            Place the proof download named <code>well-known--botcentral.txt</code> at{" "}
            <code className="break-all">.well-known/botcentral.txt</code>. If only four files
            appear, use <strong>Generate key</strong> for IndexNow. Review the files with your
            maintainer, commit them to the correct served folder, and deploy through your usual
            process.
          </p>
        </section>
        <section className={section}>
          <h2 className={heading}>Verify ownership and public responses</h2>
          <p>
            Copy the exact proof record shown on this property's campaign. Add it as a new TXT
            record at the apex of your domain through your authoritative DNS provider. Preserve
            existing TXT records. Alternatively, serve the generated{" "}
            <code className="break-all">/.well-known/botcentral.txt</code> proof file.
          </p>
          <p>
            Open the production file URLs and inspect their contents. Text files must return the
            expected text; the sitemap must return XML. An HTTP 200 response containing your app's
            HTML shell is not a successful file installation. Check framework routes, rewrites,
            deployment protection and caching when responses differ.
          </p>
          <p>
            If an existing sitemap or robots route is framework-managed, keep its owner and merge
            the needed changes with your maintainer. Verify the exact proof token, domain and
            IndexNow key shown in your own campaign.
          </p>
        </section>
        <section className={section}>
          <h2 className={heading}>BotCentral listing and billing</h2>
          <p>
            CiteFleet prepares and submits your site card.{" "}
            <a className={link} href="https://botcentral.org/docs/listing">
              BotCentral
            </a>{" "}
            verifies domain proof and hosts the public listing. File installation and a paid catalog
            listing are separate steps.
          </p>
          <p>
            BotCentral's advertised listing price, checked September 23, 2026, is{" "}
            <strong>$10 per host for 365 days</strong>. Edits inside an active term and catalog
            reads are free; failed ownership proof is not charged. An expired listing remains in the
            catalog but is marked unverified until renewed. Check the{" "}
            <a className={link} href="https://botcentral.org/v1/price">
              current price contract
            </a>{" "}
            before publishing.
          </p>
          <ol className="list-decimal space-y-3 pl-6">
            <li>
              Create your key at{" "}
              <a className={link} href="https://botcentral.org/keys">
                BotCentral API keys
              </a>
              .
            </li>
            <li>
              Enter the full key only in the campaign's billing-key password field to verify
              possession. CiteFleet sends it to BotCentral for verification and saves the public
              prefix and verification time, not the full key. An old saved prefix must be verified
              again.
            </li>
            <li>
              Open the top-up link for that key and follow that invoice's current amount, network,
              address and memo/tag instructions. A top-up funds the key; it does not itself purchase
              or renew a listing. Confirmation depends on the payment rail; manual confirmation is
              an operator-only fallback.
            </li>
            <li>
              With domain proof and sufficient credit, choose <strong>List on BotCentral</strong>.
              Review the campaign's result and paid-term end date. Do not assume an older unbilled
              listing already has a paid year.
            </li>
          </ol>
        </section>
        <section className={section}>
          <h2 className={heading}>Permissions, updates and support</h2>
          <p>
            GitHub authorization allows the approved repository operations; CiteFleet retains that
            authorization for future updates. Removing access in GitHub prevents future authorized
            writes but does not delete files already committed. Remove or change those files through
            your repository and redeploy when needed.
          </p>
          <p>
            Optional GitHub or deployment webhooks can trigger proof checks and catalog refreshes.
            Configure only the URL and signing secret shown in your campaign. Do not paste your
            BotCentral secret key into a URL, DNS record, discovery file or support message.
          </p>
          <p>
            For help, email{" "}
            <a className={link} href="mailto:support@citefleet.app">
              support@citefleet.app
            </a>{" "}
            with the affected domain, deployment URL and error message, omitting credentials.
          </p>
          <p>
            <a className={link} href="/privacy">
              Privacy notice
            </a>{" "}
            ·{" "}
            <a className={link} href="/terms">
              Terms of service
            </a>{" "}
            ·{" "}
            <a className={link} href="/support">
              Support contacts
            </a>
          </p>
        </section>
        <section className={section}>
          <h2 className={heading}>References</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <a className={link} href="https://vercel.com/docs/git">
                Vercel: deployments from Git
              </a>
            </li>
            <li>
              <a className={link} href="https://citefleet.app/about">
                CiteFleet: responsibilities and limits
              </a>
            </li>
            <li>
              <a className={link} href="https://botcentral.org/docs/listing">
                BotCentral: ownership proof and listing terms
              </a>
            </li>
          </ul>
        </section>
      </article>
    </Shell>
  );
}
