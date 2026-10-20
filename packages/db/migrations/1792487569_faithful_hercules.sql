CREATE TABLE "fraud_event" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rule_id" text,
	"rule_type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"action_taken" text NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text,
	"resolution_note" text
);
--> statement-breakpoint
CREATE TABLE "fraud_rule" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"action" text DEFAULT 'notify' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "disputed_at" timestamp;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "dispute_reason" text;--> statement-breakpoint
CREATE INDEX "fraud_event_open_idx" ON "fraud_event" ("created_at") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "fraud_event_subject_idx" ON "fraud_event" ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "fraud_event_rule_idx" ON "fraud_event" ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "fraud_rule_enabled_idx" ON "fraud_rule" ("enabled");--> statement-breakpoint
CREATE INDEX "session_ip_address_idx" ON "session" ("ip_address","created_at");--> statement-breakpoint
ALTER TABLE "fraud_event" ADD CONSTRAINT "fraud_event_rule_id_fraud_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "fraud_rule"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fraud_event" ADD CONSTRAINT "fraud_event_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fraud_rule" ADD CONSTRAINT "fraud_rule_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL;