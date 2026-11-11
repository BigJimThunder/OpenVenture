import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { organization, member } from "./core";

/**
 * Weekly availability. Each member records when they are NOT free in a
 * typical week of a term — classes, a job, practice — and the scheduler
 * subtracts those blocks (plus meetings and coffee chats already on the
 * calendar) to find times a group can meet.
 *
 * Times are minutes from midnight in the ORG's timezone, on a weekday index
 * (0 = Sunday … 6 = Saturday). Blocks belong to a term (`termKey`, defined in
 * organization.settings.scheduling.terms) so a new quarter starts clean and
 * last term's classes never leak into this term's suggestions.
 */
export const AVAILABILITY_KINDS = ["class", "busy", "prefer_not"] as const;
export type AvailabilityKind = (typeof AVAILABILITY_KINDS)[number];

export const availabilityBlock = pgTable(
  "availability_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    termKey: text("term_key").notNull(),
    /** 0 = Sunday … 6 = Saturday. */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Minutes from midnight, org timezone. start < end, both within one day. */
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    /** `prefer_not` is soft: the scheduler avoids it but may still offer it. */
    kind: text("kind").$type<AvailabilityKind>().notNull().default("class"),
    /** Optional, private to the member and admins: "ECON 201". */
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_member_term_idx").on(t.memberId, t.termKey)]
);

/** One row per member per term once they confirm their schedule is entered. */
export const availabilityConfirmation = pgTable(
  "availability_confirmation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    termKey: text("term_key").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("availability_confirmation_idx").on(t.memberId, t.termKey)]
);
