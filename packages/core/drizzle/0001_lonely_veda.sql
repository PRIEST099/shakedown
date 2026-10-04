-- Finding IDs come from a campaign's seed, so two campaigns with the same seed share them.
ALTER TABLE "findings" DROP CONSTRAINT "findings_pkey";--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_campaign_id_id_pk" PRIMARY KEY("campaign_id","id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "source" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "switches" jsonb;--> statement-breakpoint
ALTER TABLE "scenario_runs" ADD COLUMN "skipped" text;
