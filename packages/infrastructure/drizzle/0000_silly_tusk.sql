CREATE TABLE IF NOT EXISTS "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tax_id" varchar(20) NOT NULL,
	"legal_name" text NOT NULL,
	"profile" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_decisions" (
	"decision_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"engine_version" varchar(32) NOT NULL,
	"ruleset_hash" varchar(16) NOT NULL,
	"as_of_date" timestamp with time zone NOT NULL,
	"derived_tier" varchar(16) NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_rules" (
	"id" varchar(64) NOT NULL,
	"version" text NOT NULL,
	"tribute" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"jurisdiction_scope" varchar(16) NOT NULL,
	"jurisdiction_code" varchar(16),
	"condition" jsonb NOT NULL,
	"effects" jsonb NOT NULL,
	"priority" text DEFAULT '0' NOT NULL,
	"validity" "daterange" NOT NULL,
	"status" varchar(16) NOT NULL,
	"legal_basis" jsonb,
	"origin" varchar(16) NOT NULL,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_decisions_correlation" ON "tax_decisions" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_decisions_as_of" ON "tax_decisions" USING btree ("as_of_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_rules_id_version" ON "tax_rules" USING btree ("id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_rules_tribute_validity" ON "tax_rules" USING btree ("tribute");