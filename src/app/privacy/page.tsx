import type { Metadata } from "next";
import Link from "next/link";
import { aiConfigured } from "@/lib/ai";
import { loadSoleOrg } from "@/lib/intake";
import { orgSettings } from "@/lib/org-settings";
import { customNoticeParagraphs, defaultPrivacyNotice, privacyContact } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const org = await loadSoleOrg().catch(() => null);
  return {
    title: org ? `Privacy · ${org.name}` : "Privacy",
    description: org ? `How ${org.name} handles the information founders send it.` : undefined,
    alternates: { canonical: "/privacy" },
  };
}

/**
 * What a founder is told about their data before they apply. Public, linked
 * from the application form. The club's own text if it wrote one, otherwise
 * the built-in notice (src/lib/privacy.ts).
 */
export default async function PrivacyPage() {
  const org = await loadSoleOrg().catch(() => null);
  const settings = org ? orgSettings(org) : null;
  const name = org?.name ?? "This club";
  const custom = settings ? customNoticeParagraphs(settings.privacy.notice) : [];
  const contact = settings ? privacyContact(settings) : null;
  const sections =
    custom.length === 0
      ? defaultPrivacyNotice({
          orgName: name,
          schoolName: org?.schoolName,
          contactEmail: contact,
          asksDemographics: settings?.apply.askDemographics ?? true,
          usesAi: Boolean(settings?.ai.enabled && aiConfigured()),
        })
      : [];

  return (
    <div className="min-h-svh bg-chrome">
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
        <p className="text-sm text-fg-muted">{name}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-[1.75rem] sm:leading-tight">
          How we handle your information
        </h1>
        <div className="mt-6 rounded-xl border border-border bg-panel p-5 shadow-xs sm:p-8">
          {custom.length > 0 ? (
            <div className="flex flex-col gap-4 text-base leading-relaxed">
              {custom.map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
              {contact && (
                <p className="text-fg-muted">
                  Questions, or to ask for a copy or deletion of your data:{" "}
                  <a href={`mailto:${contact}`} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                    {contact}
                  </a>
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-7">
              {sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-md font-semibold tracking-tight">{section.heading}</h2>
                  <div className="mt-2 flex flex-col gap-3 text-base leading-relaxed text-fg-muted">
                    {section.body.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
        <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-muted">
          <Link href="/apply" className="underline-offset-2 hover:text-fg hover:underline">
            Back to the application
          </Link>
          <Link href="/" className="underline-offset-2 hover:text-fg hover:underline">
            About OpenVenture
          </Link>
        </p>
      </main>
    </div>
  );
}
