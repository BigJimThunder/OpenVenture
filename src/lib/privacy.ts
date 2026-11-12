import type { OrgSettings } from "@/lib/org-settings";

/**
 * The privacy notice founders see before they apply.
 *
 * A club can write its own (Settings → Intake). Until it does, this is the
 * notice: plain language, and every statement in it is something the
 * software actually does — so keep it in step with the code. It describes
 * how the application handles data; it is not legal advice, and a club with
 * obligations of its own (a university policy, GDPR) should replace it.
 */

export type NoticeSection = { heading: string; body: string[] };

export function defaultPrivacyNotice(opts: {
  orgName: string;
  schoolName?: string | null;
  contactEmail: string | null;
  asksDemographics: boolean;
  usesAi: boolean;
}): NoticeSection[] {
  const { orgName } = opts;
  const contact = opts.contactEmail
    ? `write to ${opts.contactEmail}`
    : `reply to the confirmation email, or contact any member of ${orgName}`;
  return [
    {
      heading: "What we collect",
      body: [
        `When you apply to ${orgName}, we store what you type into the form: your name and email, what you are building, how much you are asking for and what it would pay for, and the details about your team and studies.`,
        ...(opts.asksDemographics
          ? [
              "The questions under “About you” are optional. If you answer them, the answers are stored separately from your application.",
            ]
          : []),
        "We do not use advertising or analytics trackers, and the form sets no cookies.",
      ],
    },
    {
      heading: "Who sees it",
      body: [
        `Members of ${orgName} read your application to decide on a grant. Nobody outside the club is given access.`,
        ...(opts.asksDemographics
          ? [
              "The optional “About you” answers are never shown to the people reviewing your application. They are only ever reported as totals across groups of five or more applicants, and are left out of every export.",
            ]
          : []),
      ],
    },
    {
      heading: "What we use it for",
      body: [
        "To decide whether to fund you, to contact you about your application, and, added up across everyone who applies, to understand who the club is and is not reaching.",
        "If you are funded, the club records the grant, any receipts you send, and occasional check-ins on how the project is going.",
      ],
    },
    {
      heading: "Where it is kept",
      body: [
        `In ${orgName}'s own database. The club runs its own copy of OpenVenture, open-source software; there is no company in the middle holding your data, and it is never sold or shared for marketing.`,
        "Email to you is sent through the club's email provider.",
        ...(opts.usesAi
          ? [
              "The club may use an AI service (Anthropic's Claude) to draft summaries of applications for its members. Those drafts are always reviewed by a person. The optional “About you” answers are never sent to it.",
            ]
          : []),
      ],
    },
    {
      heading: "How long, and your choices",
      body: [
        "We keep your application so the club's record survives each year's change of officers.",
        `You can ask for a copy of what we hold, a correction, or for your personal details to be erased at any time: ${contact}. Erasing removes your name, email, what you wrote and the optional answers; the club keeps the amounts and dates, which no longer identify you.`,
      ],
    },
  ];
}

/** A club's own notice: blank lines separate paragraphs. */
export function customNoticeParagraphs(notice: string): string[] {
  return notice
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function privacyContact(settings: OrgSettings): string | null {
  return settings.privacy.contactEmail.trim() || settings.founderEmails.replyTo.trim() || null;
}
