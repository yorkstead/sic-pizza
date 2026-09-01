import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", ["draft", "submitted", "making", "ready", "served", "paid"]);
export const itemStatus = pgEnum("item_status", ["draft", "proposed", "confirmed", "held", "fired", "preparing", "ready", "delivered", "voided"]);
export const actorType = pgEnum("actor_type", ["employee", "guest", "system"]);
export const employeeRole = pgEnum("employee_role", ["server", "bartender", "runner", "kitchen", "expo", "manager", "host", "admin"]);
export const ticketStatus = pgEnum("ticket_status", ["queued", "accepted", "in_prep", "ready", "delivered", "cancelled"]);
export const requestStatus = pgEnum("request_status", ["pending", "acknowledged", "completed", "cancelled"]);
export const checkStatus = pgEnum("check_status", ["open", "presented", "settling", "closed"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  timezone: text("timezone").notNull(),
  taxRatePercent: integer("tax_rate_percent").notNull().default(825), // e.g. 8.25% as 825 basis points or integer
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const diningAreas = pgTable("dining_areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const servicePeriods = pgTable("service_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  active: boolean("active").notNull().default(true)
});

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  displayName: text("display_name").notNull(),
  pinHash: text("pin_hash").notNull(),
  role: employeeRole("role").notNull().default("server"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const tables = pgTable("tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  diningAreaId: uuid("dining_area_id").references(() => diningAreas.id),
  label: text("label").notNull(),
  seats: integer("seats").notNull(),
  status: text("status").notNull().default("available")
});

export const tableSessions = pgTable("table_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  tableId: uuid("table_id").notNull().references(() => tables.id),
  diningAreaId: uuid("dining_area_id").references(() => diningAreas.id),
  servicePeriodId: uuid("service_period_id").references(() => servicePeriods.id),
  openedBy: uuid("opened_by").notNull().references(() => employees.id),
  assignedServerId: uuid("assigned_server_id").references(() => employees.id),
  assistingEmployeeIds: jsonb("assisting_employee_ids").notNull().default([]),
  manualStageOverride: text("manual_stage_override"),
  joinTokenHash: text("join_token_hash").notNull(),
  version: integer("version").notNull().default(1),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true })
}, (table) => [
  uniqueIndex("table_sessions_one_active_per_location_table")
    .on(table.organizationId, table.locationId, table.tableId)
    .where(sql`${table.closedAt} is null`)
]);


export const diners = pgTable("diners", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => tableSessions.id),
  displayName: text("display_name").notNull(),
  seatNumber: integer("seat_number"),
  isGuestUser: boolean("is_guest_user").notNull().default(true),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow()
});

export const menus = pgTable("menus", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true)
});

export const kitchenStations = pgTable("kitchen_stations", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  name: text("name").notNull(),
  code: text("code").notNull(),
  color: text("color")
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  menuId: uuid("menu_id").notNull().references(() => menus.id),
  name: text("name").notNull(),
  description: text("description"),
  course: text("course").notNull().default("mains"),
  stationId: uuid("station_id").references(() => kitchenStations.id),
  basePriceCents: integer("base_price_cents").notNull(),
  allergens: jsonb("allergens").notNull().default([]),
  available: boolean("available").notNull().default(true)
});

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  minSelection: integer("min_selection").notNull().default(0),
  maxSelection: integer("max_selection").notNull().default(1),
  isRequired: boolean("is_required").notNull().default(false)
});

export const modifierOptions = pgTable("modifier_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  modifierGroupId: uuid("modifier_group_id").notNull().references(() => modifierGroups.id),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false)
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => tableSessions.id),
  status: orderStatus("status").notNull().default("draft"),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  version: integer("version").notNull().default(1)
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  menuItemId: uuid("menu_item_id").references(() => menuItems.id),
  dinerId: uuid("diner_id").references(() => diners.id),
  name: text("name").notNull(),
  course: text("course").notNull().default("mains"),
  stationId: text("station_id").notNull().default("kitchen"),
  status: itemStatus("status").notNull().default("draft"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  selectedModifiers: jsonb("selected_modifiers").notNull().default([]),
  configuration: jsonb("configuration"),
  specialInstructions: text("special_instructions"),
  confirmedByEmployeeId: uuid("confirmed_by_employee_id").references(() => employees.id),
  voidReason: text("void_reason")
});

export const kitchenTickets = pgTable("kitchen_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => tableSessions.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  stationId: text("station_id").notNull(),
  course: text("course").notNull(),
  status: ticketStatus("status").notNull().default("queued"),
  items: jsonb("items").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true })
});

export const guestRequests = pgTable("guest_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => tableSessions.id),
  tableId: uuid("table_id").references(() => tables.id),
  dinerId: uuid("diner_id").references(() => diners.id),
  type: text("type").notNull(),
  status: requestStatus("status").notNull().default("pending"),
  notes: text("notes"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true })
});

export const checks = pgTable("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull().references(() => tableSessions.id),
  title: text("title").notNull(),
  dinerIds: jsonb("diner_ids").notNull().default([]),
  items: jsonb("items").notNull().default([]),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  tipCents: integer("tip_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  paidCents: integer("paid_cents").notNull().default(0),
  balanceCents: integer("balance_cents").notNull().default(0),
  status: checkStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true })
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkId: uuid("check_id").references(() => checks.id),
  orderId: uuid("order_id").references(() => orders.id),
  sessionId: uuid("session_id").references(() => tableSessions.id),
  provider: text("provider").notNull(),
  providerReference: text("provider_reference"),
  amountCents: integer("amount_cents").notNull(),
  tipCents: integer("tip_cents").notNull().default(0),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  sessionId: uuid("session_id").references(() => tableSessions.id),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: text("aggregate_id").notNull(),
  type: text("type").notNull(),
  actorType: actorType("actor_type").notNull(),
  actorId: text("actor_id"),
  payload: jsonb("payload").notNull(),
  idempotencyKey: text("idempotency_key"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
});

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  sessionId: uuid("session_id").references(() => tableSessions.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  sequenceNumber: integer("sequence_number").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true })
});

export const idempotencyRecords = pgTable("idempotency_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  principalId: text("principal_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull().default("completed"),
  responsePayload: jsonb("response_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true })
}, (table) => [
  uniqueIndex("idempotency_records_scope_key_unique").on(
    table.organizationId,
    table.locationId,
    table.principalId,
    table.idempotencyKey
  )
]);

