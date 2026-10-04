CREATE TABLE "ai_spend" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cost_micros" bigint NOT NULL,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "campaign_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"event" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"switches" text NOT NULL,
	"seed" bigint NOT NULL,
	"cast" jsonb NOT NULL,
	"runner" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"task_run_id" text,
	"stored_as" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_job_id_campaign_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."campaign_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_events_job" ON "campaign_events" USING btree ("job_id","id");--> statement-breakpoint
CREATE INDEX "campaign_jobs_status" ON "campaign_jobs" USING btree ("status");