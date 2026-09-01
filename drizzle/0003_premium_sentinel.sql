ALTER TABLE "idempotency_records" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_records" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_unique" ON "idempotency_records" USING btree ("organization_id","location_id","principal_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_one_active_per_location_table" ON "table_sessions" USING btree ("organization_id","location_id","table_id") WHERE "table_sessions"."closed_at" is null;