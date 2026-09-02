CREATE TABLE "staff_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"device_token_hash" text NOT NULL,
	"label" text DEFAULT 'POS device' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "staff_login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"employee_id" uuid,
	"device_fingerprint_hash" text NOT NULL,
	"successful" boolean DEFAULT false NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "staff_devices" ADD CONSTRAINT "staff_devices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_login_attempts" ADD CONSTRAINT "staff_login_attempts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_login_attempts" ADD CONSTRAINT "staff_login_attempts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_device_id_staff_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."staff_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_devices_token_hash_unique" ON "staff_devices" USING btree ("device_token_hash");--> statement-breakpoint
CREATE INDEX "staff_devices_location_active_idx" ON "staff_devices" USING btree ("location_id","active");--> statement-breakpoint
CREATE INDEX "staff_login_attempts_throttle_idx" ON "staff_login_attempts" USING btree ("location_id","device_fingerprint_hash","attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_token_hash_unique" ON "staff_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "staff_sessions_employee_active_idx" ON "staff_sessions" USING btree ("employee_id","expires_at");