import type { organization } from "@/db/schema";
import { orgSettings } from "@/lib/org-settings";
import { clubToday, getTermRoster } from "@/lib/queries/availability";
import { currentTerm } from "@/lib/scheduling/terms";
import { SettingsSection } from "./settings-section";
import { TermSettings } from "./term-settings";

/** Settings → Calendar. Loads its own data so the settings page only has to mount it. */
export async function CalendarSection({ org }: { org: typeof organization.$inferSelect }) {
  const settings = orgSettings(org);
  const now = new Date();
  const term = currentTerm(settings.scheduling, now, org.timezone);
  const roster = term ? await getTermRoster(org.id, term.key) : null;
  return (
    <SettingsSection
      id="calendar"
      title="Calendar"
      description="Quarters or semesters, and the hours the club meets. Members put their class schedule in once a term, and the app finds times for meetings and coffee chats around it."
    >
      <TermSettings
        scheduling={settings.scheduling}
        today={clubToday(org, now)}
        timeZone={org.timezone}
        remindersOn={settings.automation.scheduleReminders}
        roster={
          term && roster
            ? { termName: term.name, confirmed: roster.filter((r) => r.confirmedAt).length, total: roster.length }
            : null
        }
      />
    </SettingsSection>
  );
}
