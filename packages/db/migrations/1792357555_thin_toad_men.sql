CREATE TABLE "promo_code" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"code" text NOT NULL UNIQUE,
	"amount" numeric NOT NULL,
	"max_redemptions" integer,
	"per_org_limit" integer DEFAULT 1 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_by_email" text
);
--> statement-breakpoint
CREATE TABLE "promo_code_redemption" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"promo_code_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"amount" numeric NOT NULL,
	"transaction_id" text
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "signup_bonus_granted_at" timestamp;--> statement-breakpoint
CREATE INDEX "promo_code_created_at_idx" ON "promo_code" ("created_at");--> statement-breakpoint
CREATE INDEX "promo_code_redemption_promo_code_id_idx" ON "promo_code_redemption" ("promo_code_id","created_at");--> statement-breakpoint
CREATE INDEX "promo_code_redemption_organization_id_idx" ON "promo_code_redemption" ("organization_id");--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_promo_code_id_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_code"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "promo_code_redemption" ADD CONSTRAINT "promo_code_redemption_transaction_id_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transaction"("id") ON DELETE SET NULL;