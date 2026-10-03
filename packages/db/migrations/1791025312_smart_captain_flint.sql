ALTER TABLE "organization" ADD COLUMN "dodo_customer_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "dev_plan_dodo_subscription_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "dodo_payment_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_dodo_customer_id_key" UNIQUE("dodo_customer_id");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_dev_plan_dodo_subscription_id_key" UNIQUE("dev_plan_dodo_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_dodo_payment_id_unique" ON "transaction" ("dodo_payment_id") WHERE "dodo_payment_id" IS NOT NULL;