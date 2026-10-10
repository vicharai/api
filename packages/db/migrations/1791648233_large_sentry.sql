ALTER TABLE "organization" ADD COLUMN "dodo_auto_top_up_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "auto_top_up_failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "auto_top_up_last_failure_at" timestamp;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "dodo_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "dodo_refund_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_dodo_auto_top_up_subscription_id_key" UNIQUE("dodo_auto_top_up_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_dodo_refund_id_unique" ON "transaction" ("dodo_refund_id") WHERE "dodo_refund_id" IS NOT NULL;