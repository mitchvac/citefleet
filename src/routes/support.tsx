import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/citefleet/Shell";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support | CiteFleet" },
      {
        name: "description",
        content: "Contact CiteFleet for general inquiries, product support, and sales questions.",
      },
      { property: "og:title", content: "CiteFleet support" },
      {
        property: "og:description",
        content: "Get in touch with CiteFleet for general inquiries, support, or sales.",
      },
    ],
    links: [{ rel: "canonical", href: "https://citefleet.app/support" }],
  }),
  component: SupportPage,
});

const CONTACTS = [
  {
    title: "General inquiries",
    email: "info@citefleet.app",
    description: "Questions about CiteFleet or getting in touch with the team.",
  },
  {
    title: "Support",
    email: "support@citefleet.app",
    description: "Help with your account, website setup, or using CiteFleet.",
  },
  {
    title: "Sales",
    email: "sales@citefleet.app",
    description: "Discuss using CiteFleet for your business or team.",
  },
] as const;

function SupportPage() {
  return (
    <Shell eyebrow="Contact" title="Support">
      <article className="max-w-5xl">
        <p className="max-w-3xl text-xl leading-8 text-[#d9d3ee]">
          Get in touch with CiteFleet. Choose the email address that best fits your question.
        </p>
        <p className="mt-5 text-sm text-[#b7b0cc]">
          Setting up a Vercel website? Read the{" "}
          <a className="text-[#4ee0c3] underline underline-offset-4" href="/docs/integrations/vercel">
            CiteFleet Origin guide
          </a>.
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {CONTACTS.map((contact) => (
            <section key={contact.email} className="min-w-0 border-t border-white/10 pt-6">
              <h2 className="text-xl font-semibold text-white">{contact.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#b7b0cc]">{contact.description}</p>
              <a
                href={`mailto:${contact.email}`}
                className="mt-3 inline-flex min-h-11 items-center break-all text-sm text-[#4ee0c3] underline underline-offset-4 hover:text-[#79ead3]"
              >
                {contact.email}
              </a>
            </section>
          ))}
        </div>
      </article>
    </Shell>
  );
}
