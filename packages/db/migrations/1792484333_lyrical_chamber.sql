ALTER TABLE "organization" ADD COLUMN "suspended_until" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "suspend_reason" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "trust_tier_override_until" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_until" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspend_reason" text;