CREATE TYPE "public"."check_status" AS ENUM('open', 'presented', 'settling', 'closed');--> statement-breakpoint
CREATE TYPE "public"."employee_role" AS ENUM('server', 'bartender', 'runner', 'kitchen', 'expo', 'manager', 'host', 'admin');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('draft', 'proposed', 'confirmed', 'held', 'fired', 'preparing', 'ready', 'delivered', 'voided');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'acknowledged', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('queued', 'accepted', 'in_prep', 'ready', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TABLE "checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"title" text NOT NULL,
	"diner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"status" "check_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dining_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"table_id" uuid,
	"diner_id" uuid,
	"type" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "kitchen_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"color" text
);
--> statement-breakpoint
CREATE TABLE "kitchen_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"station_id" text NOT NULL,
	"course" text NOT NULL,
	"status" "ticket_status" DEFAULT 'queued' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"course" text DEFAULT 'mains' NOT NULL,
	"station_id" uuid,
	"base_price_cents" integer NOT NULL,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"min_selection" integer DEFAULT 0 NOT NULL,
	"max_selection" integer DEFAULT 1 NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modifier_group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "aggregate_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "role" SET DEFAULT 'server'::"public"."employee_role";--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "role" SET DATA TYPE "public"."employee_role" USING "role"::"public"."employee_role";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "quantity" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "configuration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "tip_cents" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "seat_number" integer;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "is_guest_user" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "joined_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "tax_rate_percent" integer DEFAULT 825 NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "menu_item_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "course" text DEFAULT 'mains' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "station_id" text DEFAULT 'kitchen' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "status" "item_status" DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "selected_modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "special_instructions" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "check_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "dining_area_id" uuid;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "service_period_id" uuid;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "assigned_server_id" uuid;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "dining_area_id" uuid;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "status" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_requests" ADD CONSTRAINT "guest_requests_diner_id_diners_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."diners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_modifier_group_id_modifier_groups_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_periods" ADD CONSTRAINT "service_periods_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_check_id_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_table_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_dining_area_id_dining_areas_id_fk" FOREIGN KEY ("dining_area_id") REFERENCES "public"."dining_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_service_period_id_service_periods_id_fk" FOREIGN KEY ("service_period_id") REFERENCES "public"."service_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_assigned_server_id_employees_id_fk" FOREIGN KEY ("assigned_server_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_dining_area_id_dining_areas_id_fk" FOREIGN KEY ("dining_area_id") REFERENCES "public"."dining_areas"("id") ON DELETE no action ON UPDATE no action;