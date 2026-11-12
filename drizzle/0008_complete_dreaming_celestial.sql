CREATE TABLE "file_chunk" (
	"file_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "blob_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ALTER COLUMN "pathname" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "file" ADD COLUMN "chunk_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "file_chunk" ADD CONSTRAINT "file_chunk_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_chunk_pk" ON "file_chunk" USING btree ("file_id","seq");