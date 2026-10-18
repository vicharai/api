CREATE TABLE "admin_action_log" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"admin_user_id" text,
	"admin_email" text NOT NULL,
	"admin_role" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"target_organization_id" text,
	"target_user_id" text,
	"status_code" integer NOT NULL,
	"request_summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "admin_member" (
	"user_id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "crm_account" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"segment" text DEFAULT 'smb' NOT NULL,
	"stage" text DEFAULT 'lead' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"deal_value" numeric,
	"annual_contract_value" numeric,
	"expected_close_date" timestamp,
	"owner_user_id" text,
	"notes" text,
	"organization_ids" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_activity" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"account_id" text NOT NULL,
	"type" text NOT NULL,
	"body" text NOT NULL,
	"due_at" timestamp,
	"done_at" timestamp,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "crm_contact" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"title" text,
	"phone" text
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "provider_access_mode" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "provider_access_providers" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "provider_access_models" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "provider_access_mappings" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "provider_access_reason" text;--> statement-breakpoint
CREATE INDEX "admin_action_log_created_at_idx" ON "admin_action_log" ("created_at");--> statement-breakpoint
CREATE INDEX "admin_action_log_admin_user_id_idx" ON "admin_action_log" ("admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_action_log_target_org_idx" ON "admin_action_log" ("target_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_action_log_target_user_idx" ON "admin_action_log" ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_account_stage_idx" ON "crm_account" ("stage");--> statement-breakpoint
CREATE INDEX "crm_account_domain_idx" ON "crm_account" ("domain");--> statement-breakpoint
CREATE INDEX "crm_activity_account_id_idx" ON "crm_activity" ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_activity_open_tasks_idx" ON "crm_activity" ("type","done_at");--> statement-breakpoint
CREATE INDEX "crm_contact_account_id_idx" ON "crm_contact" ("account_id");--> statement-breakpoint
ALTER TABLE "admin_action_log" ADD CONSTRAINT "admin_action_log_admin_user_id_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "admin_member" ADD CONSTRAINT "admin_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "admin_member" ADD CONSTRAINT "admin_member_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "crm_account" ADD CONSTRAINT "crm_account_owner_user_id_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_account_id_crm_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "crm_contact" ADD CONSTRAINT "crm_contact_account_id_crm_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "crm_account"("id") ON DELETE CASCADE;