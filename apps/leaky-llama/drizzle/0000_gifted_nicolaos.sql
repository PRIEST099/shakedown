CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" integer,
	"capture_id" text,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"status" text NOT NULL,
	"response" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"paypal_order_id" text,
	"checkout_key" text,
	"email" text NOT NULL,
	"items" jsonb NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"capture_id" text,
	"captured_cents" integer DEFAULT 0 NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"last_event_at" text,
	"fulfilled_at" timestamp with time zone,
	"mode" jsonb NOT NULL,
	"campaign_id" text,
	"visitor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_paypal_order_id_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "orders_checkout_key_unique" UNIQUE("checkout_key")
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"paypal_refund_id" text,
	"amount_cents" integer NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"source" text NOT NULL,
	"items" jsonb NOT NULL,
	"value_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text,
	"event_type" text,
	"create_time" text,
	"order_id" integer,
	"raw" text NOT NULL,
	"headers" jsonb NOT NULL,
	"verification" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disputes_order" ON "disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_visitor" ON "orders" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "orders_capture" ON "orders" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "orders_campaign" ON "orders" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "refunds_order" ON "refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_order" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_order" ON "webhook_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event" ON "webhook_deliveries" USING btree ("event_id");