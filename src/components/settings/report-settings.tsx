import type { OrgSettings } from "@/lib/org-settings";
import { PreferenceText } from "@/components/settings/preference-text";
import { SettingsCard } from "@/components/settings/settings-section";

/**
 * Who the club's reports go to and the two paragraphs they quote. Each field
 * saves on its own, so half a form can't be lost.
 */
export function ReportSettings({ reports }: { reports: OrgSettings["reports"] }) {
  return (
    <>
      <SettingsCard
        title="Who signs off"
        description="Funding requests are emailed here once a partner finalizes them. A donor, an advisor or a university office."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <PreferenceText
            section="reports"
            field="approverName"
            value={reports.approverName}
            label="Approver's name"
            placeholder="Dana Whitfield"
            maxLength={120}
            hint="Shown in “sent to Dana on Nov 12”."
          />
          <PreferenceText
            section="reports"
            field="approverEmail"
            value={reports.approverEmail}
            label="Approver's email"
            type="email"
            placeholder="dana@university.edu"
            maxLength={200}
            hint="Partners can still change it for one send."
          />
        </div>
      </SettingsCard>
      <SettingsCard
        title="Who reads the letters"
        description="The quarterly letter and the annual report go to these addresses. Each person gets their own copy."
      >
        <PreferenceText
          section="reports"
          field="lpEmails"
          value={reports.lpEmails}
          label="Supporters' emails"
          placeholder="dana@university.edu, alumni-board@example.org"
          maxLength={2000}
          multiline
          hint="Separate addresses with commas."
        />
      </SettingsCard>
      <SettingsCard
        title="In the club's words"
        description="Quoted in reports, and given to AI drafts so they argue from what the club actually looks for."
      >
        <div className="flex flex-col gap-4">
          <PreferenceText
            section="reports"
            field="mission"
            value={reports.mission}
            label="Mission"
            placeholder="We give small grants to student founders so the first experiment doesn't wait on money."
            maxLength={2000}
            multiline
            hint="One or two sentences on what the club is for. Opens the annual report."
          />
          <PreferenceText
            section="reports"
            field="thesis"
            value={reports.thesis}
            label="What we look for"
            placeholder="A founder who has already talked to the people with the problem, and a check small enough that we can say yes quickly."
            maxLength={3000}
            multiline
            hint="What makes the club say yes. Funding request drafts are checked against it."
          />
        </div>
      </SettingsCard>
    </>
  );
}
