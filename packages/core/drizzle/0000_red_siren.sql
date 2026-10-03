CREATE TYPE "public"."severity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('sealed', 'leak', 'inconclusive');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"seed" bigint NOT NULL,
	"target" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"stopped_early" text,
	"merchant_leak_cents" integer DEFAULT 0 NOT NULL,
	"customer_harm_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"scenario_run_id" integer NOT NULL,
	"persona" text NOT NULL,
	"scenario" text NOT NULL,
	"invariant" text NOT NULL,
	"title" text NOT NULL,
	"severity" "severity" NOT NULL,
	"merchant_leak_cents" integer DEFAULT 0 NOT NULL,
	"customer_harm_cents" integer DEFAULT 0 NOT NULL,
	"detail" text NOT NULL,
	"fix" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invariant_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_run_id" integer NOT NULL,
	"invariant" text NOT NULL,
	"title" text NOT NULL,
	"verdict" "verdict" NOT NULL,
	"detail" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"scenario_run_id" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"entry" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"persona" text NOT NULL,
	"scenario" text NOT NULL,
	"title" text NOT NULL,
	"plan" jsonb NOT NULL,
	"error" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_scenario_run_id_scenario_runs_id_fk" FOREIGN KEY ("scenario_run_id") REFERENCES "public"."scenario_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invariant_results" ADD CONSTRAINT "invariant_results_scenario_run_id_scenario_runs_id_fk" FOREIGN KEY ("scenario_run_id") REFERENCES "public"."scenario_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_scenario_run_id_scenario_runs_id_fk" FOREIGN KEY ("scenario_run_id") REFERENCES "public"."scenario_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD CONSTRAINT "scenario_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_campaign" ON "findings" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invariant_results_run_invariant" ON "invariant_results" USING btree ("scenario_run_id","invariant");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_run_position" ON "ledger_entries" USING btree ("scenario_run_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_runs_campaign_position" ON "scenario_runs" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE INDEX "scenario_runs_campaign" ON "scenario_runs" USING btree ("campaign_id");