import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  numeric,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, member } from "./core";
import { application } from "./pipeline";

/** Meetings, attendance (first-class — clubs enforce attendance minimums),
 *  onboarding tracks, and internal docs. */

export const MEETING_KINDS = ["general", "ic", "sourcing", "training", "social", "other"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const meeting = pgTable(
  "meeting",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    /** Per-org sequential number behind the human-readable ref (MTG-12). */
    ref: integer("ref").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<MeetingKind>().notNull().default("general"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    location: text("location"),
    videoUrl: text("video_url"),
    status: text("status").$type<MeetingStatus>().notNull().default("scheduled"),
    notes: text("notes"),
    recapSentAt: timestamp("recap_sent_at", { withTimezone: true }),
    createdByMemberId: uuid("created_by_member_id").references(() => member.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("meeting_org_ref_idx").on(t.orgId, t.ref)]
);

export const AGENDA_ITEM_KINDS = [
  "application_review",
  "pitch",
  "ic_vote",
  "update",
  "training",
  "admin",
  "other",
] as const;
export type AgendaItemKind = (typeof AGENDA_ITEM_KINDS)[number];

export const AGENDA_ITEM_STATUSES = ["pending", "in_progress", "done", "deferred"] as const;
export type AgendaItemStatus = (typeof AGENDA_ITEM_STATUSES)[number];

export const agendaItem = pgTable("agenda_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meeting.id, { onDelete: "cascade" }),
  position: numeric("position", { precision: 12, scale: 6 }).notNull().default("0"),
  title: text("title").notNull(),
  kind: text("kind").$type<AgendaItemKind>().notNull().default("other"),
  presenterMemberId: uuid("presenter_member_id").references(() => member.id),
  applicationId: uuid("application_id").references(() => application.id),
  voteRoundId: uuid("vote_round_id"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  status: text("status").$type<AgendaItemStatus>().notNull().default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const ATTENDANCE_STATUSES = ["present", "remote", "late", "excused", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const attendance = pgTable(
  "attendance",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meeting.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    status: text("status").$type<AttendanceStatus>().notNull(),
    recordedByMemberId: uuid("recorded_by_member_id").references(() => member.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_pk").on(t.meetingId, t.memberId)]
);

export const ACTION_ITEM_STATUSES = ["open", "done", "cancelled"] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const actionItem = pgTable(
  "action_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    /** Per-org sequential number behind the human-readable ref (TSK-84). */
    ref: integer("ref").notNull(),
    meetingId: uuid("meeting_id").references(() => meeting.id, { onDelete: "set null" }),
    agendaItemId: uuid("agenda_item_id").references(() => agendaItem.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => application.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeMemberId: uuid("assignee_member_id").references(() => member.id),
    createdByMemberId: uuid("created_by_member_id").references(() => member.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").$type<ActionItemStatus>().notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("action_item_org_ref_idx").on(t.orgId, t.ref)]
);

// ——— Onboarding ———

export const ONBOARDING_TASK_KINDS = ["read", "watch", "do", "meet", "submit"] as const;
export type OnboardingTaskKind = (typeof ONBOARDING_TASK_KINDS)[number];

export const onboardingTrack = pgTable("onboarding_track", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const onboardingTask = pgTable("onboarding_task", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackId: uuid("track_id")
    .notNull()
    .references(() => onboardingTrack.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  kind: text("kind").$type<OnboardingTaskKind>().notNull().default("do"),
  resourceUrl: text("resource_url"),
  docId: uuid("doc_id"),
  required: boolean("required").notNull().default(true),
  estimatedMinutes: integer("estimated_minutes"),
});

export const onboardingAssignment = pgTable("onboarding_assignment", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  trackId: uuid("track_id")
    .notNull()
    .references(() => onboardingTrack.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const onboardingCompletion = pgTable(
  "onboarding_completion",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => onboardingAssignment.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => onboardingTask.id),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedByMemberId: uuid("verified_by_member_id").references(() => member.id),
  },
  (t) => [uniqueIndex("onboarding_completion_unique").on(t.assignmentId, t.taskId)]
);

// ——— Internal docs / wiki ———

export const DOC_VISIBILITIES = ["all", "partners", "admins"] as const;
export type DocVisibility = (typeof DOC_VISIBILITIES)[number];

export const doc = pgTable("doc", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  folder: text("folder"),
  contentJson: text("content_json"),
  contentText: text("content_text").notNull().default(""),
  visibility: text("visibility").$type<DocVisibility>().notNull().default("all"),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdByMemberId: uuid("created_by_member_id").references(() => member.id),
  updatedByMemberId: uuid("updated_by_member_id").references(() => member.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
