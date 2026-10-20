CREATE TABLE "catalog_deletion" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"scope" text NOT NULL,
	"target" text NOT NULL,
	"reason" text,
	"deleted_by" text,
	"deleted_by_email" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_deletion_scope_target_unique" ON "catalog_deletion" ("scope","target");--> statement-breakpoint
ALTER TABLE "catalog_deletion" ADD CONSTRAINT "catalog_deletion_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by") REFERENCES "user"("id") ON DELETE SET NULL;