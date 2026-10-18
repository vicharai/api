CREATE TABLE "admin_announcement" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"href" text,
	"segment" jsonb NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_by_email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_note" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"author_user_id" text
);
--> statement-breakpoint
CREATE TABLE "admin_tag" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"tag" text NOT NULL,
	"created_by" text,
	CONSTRAINT "admin_tag_target_tag_unique" UNIQUE("target_type","target_id","tag")
);
--> statement-breakpoint
CREATE TABLE "routing_override" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"scope" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp,
	"created_by" text
);
--> statement-breakpoint
CREATE INDEX "admin_announcement_created_at_idx" ON "admin_announcement" ("created_at");--> statement-breakpoint
CREATE INDEX "admin_note_target_idx" ON "admin_note" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "admin_tag_tag_idx" ON "admin_tag" ("target_type","tag");--> statement-breakpoint
CREATE INDEX "routing_override_scope_target_idx" ON "routing_override" ("scope","target");--> statement-breakpoint
ALTER TABLE "admin_announcement" ADD CONSTRAINT "admin_announcement_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "admin_note" ADD CONSTRAINT "admin_note_author_user_id_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "admin_tag" ADD CONSTRAINT "admin_tag_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "routing_override" ADD CONSTRAINT "routing_override_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;