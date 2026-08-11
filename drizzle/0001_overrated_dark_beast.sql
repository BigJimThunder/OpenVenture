-- Human-readable entity refs (APP-141, MEM-27, MTG-12, TSK-84) + triage priority.
--
-- `ref` is NOT NULL with no default, so each table is added nullable, backfilled
-- with a per-org sequence in creation order, then tightened. Doing it in one
-- `ADD COLUMN ... NOT NULL` would fail on any deployment that already has rows.

ALTER TABLE "application" ADD COLUMN "ref" integer;--> statement-breakpoint
UPDATE "application" a SET "ref" = s.rn FROM (
  SELECT "id", row_number() OVER (PARTITION BY "org_id" ORDER BY "created_at", "id") AS rn
  FROM "application"
) s WHERE a."id" = s."id";--> statement-breakpoint
ALTER TABLE "application" ALTER COLUMN "ref" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "application" ADD COLUMN "priority" text DEFAULT 'none' NOT NULL;--> statement-breakpoint

ALTER TABLE "memo" ADD COLUMN "ref" integer;--> statement-breakpoint
UPDATE "memo" m SET "ref" = s.rn FROM (
  SELECT "id", row_number() OVER (PARTITION BY "org_id" ORDER BY "created_at", "id") AS rn
  FROM "memo"
) s WHERE m."id" = s."id";--> statement-breakpoint
ALTER TABLE "memo" ALTER COLUMN "ref" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "action_item" ADD COLUMN "ref" integer;--> statement-breakpoint
UPDATE "action_item" ai SET "ref" = s.rn FROM (
  SELECT "id", row_number() OVER (PARTITION BY "org_id" ORDER BY "created_at", "id") AS rn
  FROM "action_item"
) s WHERE ai."id" = s."id";--> statement-breakpoint
ALTER TABLE "action_item" ALTER COLUMN "ref" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "meeting" ADD COLUMN "ref" integer;--> statement-breakpoint
UPDATE "meeting" mt SET "ref" = s.rn FROM (
  SELECT "id", row_number() OVER (PARTITION BY "org_id" ORDER BY "created_at", "id") AS rn
  FROM "meeting"
) s WHERE mt."id" = s."id";--> statement-breakpoint
ALTER TABLE "meeting" ALTER COLUMN "ref" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "application_org_ref_idx" ON "application" USING btree ("org_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "memo_org_ref_idx" ON "memo" USING btree ("org_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "action_item_org_ref_idx" ON "action_item" USING btree ("org_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_org_ref_idx" ON "meeting" USING btree ("org_id","ref");
