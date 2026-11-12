CREATE TABLE "job_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'daily' NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"emails" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"report" jsonb
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "email_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "job_run_started_idx" ON "job_run" USING btree ("kind","started_at");