ALTER TABLE "member" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "major" text;--> statement-breakpoint
-- Members who were already using the app are not sent back through the welcome flow.
UPDATE "member" SET "onboarded_at" = now() WHERE "user_id" IS NOT NULL AND "status" = 'active';
