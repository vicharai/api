CREATE TABLE "allowance_reservation" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" text NOT NULL,
	"project_id" text NOT NULL,
	"reserved_amount" numeric DEFAULT '0' NOT NULL,
	"settled_amount" numeric,
	"state" text DEFAULT 'open' NOT NULL,
	"settled_at" timestamp,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "reserved_credits" numeric DEFAULT '0' NOT NULL;--> statement-breakpoint
CREATE INDEX "allowance_reservation_organization_id_state_idx" ON "allowance_reservation" ("organization_id","state");--> statement-breakpoint
CREATE INDEX "allowance_reservation_state_created_at_idx" ON "allowance_reservation" ("state","created_at");--> statement-breakpoint
ALTER TABLE "allowance_reservation" ADD CONSTRAINT "allowance_reservation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;