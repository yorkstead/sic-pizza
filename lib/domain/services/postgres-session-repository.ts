import { Pool, type PoolClient } from "pg";
import type { TableSession, Diner, DiningStage } from "../models/session";
import type { OrderItem, SplitMode } from "../models/order";
import type { KitchenTicket } from "../models/kitchen";
import type { GuestRequest, RequestCategory, RequestStatus } from "../models/request";
import type { Check, Payment, PaymentStatus } from "../models/payment";
import type { DomainEvent } from "../models/events";
import type {
  TableSessionRepository,
  TenantContext,
  CommitTransactionParams,
  IdempotencyCheckResult
} from "./session-repository";
import { ensureUuid, hashPayload } from "../utils/id-utils";


export interface PostgresRepositoryConfig {
  connectionString?: string;
  pool?: Pool;
}

interface SessionRow {
  id: string;
  organization_id?: string | null;
  location_id?: string | null;
  table_id: string;
  table_label?: string | null;
  dining_area_id?: string | null;
  service_period_id?: string | null;
  opened_by: string;
  assigned_server_id?: string | null;
  assisting_employee_ids?: string[] | null;
  manual_stage_override?: string | null;
  join_token_hash: string;
  version: number;
  opened_at: string | Date;
  closed_at?: string | Date | null;
}

export class PostgresTableSessionRepository implements TableSessionRepository {

  private pool: Pool;
  private ownPool: boolean;

  constructor(config: PostgresRepositoryConfig) {
    if (config.pool) {
      this.pool = config.pool;
      this.ownPool = false;
    } else if (config.connectionString) {
      this.pool = new Pool({ connectionString: config.connectionString });
      this.ownPool = true;
    } else {
      const connStr = process.env.DATABASE_URL;
      if (!connStr) {
        throw new Error(
          "PostgresTableSessionRepository requires a valid connectionString or DATABASE_URL in the environment"
        );
      }
      this.pool = new Pool({ connectionString: connStr });
      this.ownPool = true;
    }
  }

  public async close(): Promise<void> {
    if (this.ownPool) {
      await this.pool.end();
    }
  }

  private normalizeContext(ctxOrId: TenantContext | string, maybeId?: string): { ctx: TenantContext; id: string } {
    if (typeof ctxOrId === "string") {
      throw new Error("PostgreSQL session access requires explicit TenantContext");
    }
    if (!ctxOrId.organizationId || !ctxOrId.locationId) {
      throw new Error("PostgreSQL session access requires organizationId and locationId");
    }
    return { ctx: ctxOrId, id: maybeId || "" };
  }

  async findById(ctxOrSessionId: TenantContext | string, maybeSessionId?: string): Promise<TableSession | null> {
    const { ctx, id: rawSessionId } = this.normalizeContext(ctxOrSessionId, maybeSessionId);
    const sessionUuid = ensureUuid(rawSessionId);
    const locationUuid = ensureUuid(ctx.locationId);
    const organizationUuid = ensureUuid(ctx.organizationId!);

    const client = await this.pool.connect();
    try {
      const sessionRes = await client.query(
        `SELECT ts.*, t.label as table_label 
         FROM table_sessions ts 
         LEFT JOIN tables t ON t.id = ts.table_id 
         WHERE ts.id = $1 AND ts.organization_id = $2 AND ts.location_id = $3`,
        [sessionUuid, organizationUuid, locationUuid]
      );

      if (sessionRes.rows.length === 0) return null;
      const row = sessionRes.rows[0];

      return await this.hydrateSession(client, row, rawSessionId, ctx);
    } finally {
      client.release();
    }
  }

  async findByTableId(ctxOrTableId: TenantContext | string, maybeTableId?: string): Promise<TableSession | null> {
    const { ctx, id: rawTableId } = this.normalizeContext(ctxOrTableId, maybeTableId);
    const tableUuid = ensureUuid(rawTableId);
    const locationUuid = ensureUuid(ctx.locationId);
    const organizationUuid = ensureUuid(ctx.organizationId!);

    const client = await this.pool.connect();
    try {
      const sessionRes = await client.query(
        `SELECT ts.*, t.label as table_label 
         FROM table_sessions ts 
         LEFT JOIN tables t ON t.id = ts.table_id 
         WHERE ts.table_id = $1 AND ts.organization_id = $2 AND ts.location_id = $3 AND ts.closed_at IS NULL
         LIMIT 1`,
        [tableUuid, organizationUuid, locationUuid]
      );

      if (sessionRes.rows.length === 0) return null;
      const row = sessionRes.rows[0];

      return await this.hydrateSession(client, row, undefined, ctx);
    } finally {
      client.release();
    }
  }

  async listActive(ctxOrLocationId: TenantContext | string): Promise<TableSession[]> {
    if (typeof ctxOrLocationId === "string" || !ctxOrLocationId.organizationId) {
      throw new Error("PostgreSQL session access requires explicit organizationId and locationId");
    }
    const locationUuid = ensureUuid(ctxOrLocationId.locationId);
    const organizationUuid = ensureUuid(ctxOrLocationId.organizationId);

    const client = await this.pool.connect();
    try {
      const sessionRes = await client.query(
        `SELECT ts.*, t.label as table_label 
         FROM table_sessions ts 
         LEFT JOIN tables t ON t.id = ts.table_id 
         WHERE ts.organization_id = $1 AND ts.location_id = $2 AND ts.closed_at IS NULL
         ORDER BY ts.opened_at DESC`,
        [organizationUuid, locationUuid]
      );

      const sessions: TableSession[] = [];
      for (const row of sessionRes.rows) {
        sessions.push(await this.hydrateSession(client, row, undefined, ctxOrLocationId));
      }
      return sessions;
    } finally {
      client.release();
    }
  }

  async listAll(ctx?: TenantContext): Promise<TableSession[]> {
    if (!ctx) {
      throw new Error("listAll in PostgresTableSessionRepository requires explicit TenantContext");
    }
    const locationUuid = ensureUuid(ctx.locationId);
    const organizationUuid = ensureUuid(ctx.organizationId!);

    const client = await this.pool.connect();
    try {
      const sessionRes = await client.query(
        `SELECT ts.*, t.label as table_label 
         FROM table_sessions ts 
         LEFT JOIN tables t ON t.id = ts.table_id 
         WHERE ts.organization_id = $1 AND ts.location_id = $2
         ORDER BY ts.opened_at DESC`,
        [organizationUuid, locationUuid]
      );

      const sessions: TableSession[] = [];
      for (const row of sessionRes.rows) {
        sessions.push(await this.hydrateSession(client, row, undefined, ctx));
      }
      return sessions;
    } finally {
      client.release();
    }
  }

  private async hydrateSession(
    client: PoolClient,
    rawRow: Record<string, unknown>,
    preferredId?: string,
    preferredContext?: TenantContext
  ): Promise<TableSession> {

    const row = rawRow as unknown as SessionRow;
    const sessionUuid = row.id;

    // Diners
    const dinersRes = await client.query(
      `SELECT * FROM diners WHERE session_id = $1 ORDER BY joined_at ASC`,
      [sessionUuid]
    );
    const diners: Diner[] = dinersRes.rows.map((d) => ({
      id: d.id,
      sessionId: preferredId || (d.session_id as string),
      displayName: d.display_name,
      seatNumber: d.seat_number ?? undefined,
      isGuestUser: Boolean(d.is_guest_user),
      joinedAt: new Date(d.joined_at).toISOString()
    }));

    // Orders & Order Items
    const orderItemsRes = await client.query(
      `SELECT oi.*, o.id as order_id FROM order_items oi 
       JOIN orders o ON o.id = oi.order_id 
       WHERE o.session_id = $1 
       ORDER BY oi.id ASC`,
      [sessionUuid]
    );
    const items: OrderItem[] = orderItemsRes.rows.map((i) => {
      const config = (i.configuration && typeof i.configuration === "object" ? i.configuration : {}) as Record<string, unknown>;
      return {
        id: i.id,
        orderId: i.order_id,
        sessionId: preferredId || (row.id as string),
        menuItemId: (i.menu_item_id as string) || i.name,
        name: i.name,
        course: i.course,
        stationId: i.station_id,
        status: i.status,
        quantity: i.quantity,
        basePriceCents: i.unit_price_cents,
        selectedModifiers: Array.isArray(i.selected_modifiers)
          ? i.selected_modifiers
          : i.selected_modifiers
            ? JSON.parse(String(i.selected_modifiers))
            : [],
        specialInstructions: i.special_instructions ?? undefined,
        dinerId: i.diner_id ?? undefined,
        splitMode: (config.splitMode as SplitMode) || "single",
        assignedDinerIds: Array.isArray(config.assignedDinerIds)
          ? (config.assignedDinerIds as string[])
          : i.diner_id
            ? [i.diner_id as string]
            : [],
        customShares: config.customShares as Record<string, number> | undefined,
        confirmedByEmployeeId: i.confirmed_by_employee_id ?? undefined,
        voidReason: i.void_reason ?? undefined,
        createdAt: new Date().toISOString()
      };
    });

    // Kitchen Tickets
    const ticketsRes = await client.query(
      `SELECT * FROM kitchen_tickets WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionUuid]
    );
    const tickets: KitchenTicket[] = ticketsRes.rows.map((t) => ({
      id: t.id,
      sessionId: preferredId || (row.id as string),
      orderId: t.order_id,
      tableLabel: (row.table_label as string) || "Table",
      stationId: t.station_id,
      course: t.course,
      status: t.status,
      items: Array.isArray(t.items) ? t.items : JSON.parse(String(t.items)),
      createdAt: new Date(t.created_at).toISOString(),
      acceptedAt: t.accepted_at ? new Date(t.accepted_at).toISOString() : undefined,
      readyAt: t.ready_at ? new Date(t.ready_at).toISOString() : undefined,
      deliveredAt: t.delivered_at ? new Date(t.delivered_at).toISOString() : undefined
    }));

    // Guest Requests
    const requestsRes = await client.query(
      `SELECT * FROM guest_requests WHERE session_id = $1 ORDER BY requested_at ASC`,
      [sessionUuid]
    );
    const requests: GuestRequest[] = requestsRes.rows.map((r) => ({
      id: r.id,
      sessionId: preferredId || (row.id as string),
      tableId: r.table_id || (row.table_id as string),
      tableLabel: (row.table_label as string) || "Table",
      dinerId: r.diner_id ?? undefined,
      category: r.type ? (r.type as RequestCategory) : "SERVER_NEEDED",
      priority: "NORMAL",
      status: (r.status === "pending" ? "OPEN" : String(r.status).toUpperCase()) as RequestStatus,
      assignedRole: "server",
      createdAt: new Date(r.requested_at).toISOString(),
      acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : undefined,
      completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : undefined,
      escalationState: "NORMAL",
      notes: r.notes ?? undefined,
      type: r.type ? (r.type as RequestCategory) : "SERVER_NEEDED"
    }));

    // Checks
    const checksRes = await client.query(
      `SELECT * FROM checks WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionUuid]
    );
    const checks: Check[] = checksRes.rows.map((c) => ({
      id: c.id,
      sessionId: preferredId || (row.id as string),
      title: c.title,
      dinerIds: Array.isArray(c.diner_ids) ? c.diner_ids : JSON.parse(String(c.diner_ids)),
      items: Array.isArray(c.items) ? c.items : JSON.parse(String(c.items)),
      subtotalCents: c.subtotal_cents,
      taxCents: c.tax_cents,
      tipCents: c.tip_cents,
      totalCents: c.total_cents,
      paidCents: c.paid_cents,
      balanceCents: c.balance_cents,
      status: c.status,
      createdAt: new Date(c.created_at).toISOString(),
      closedAt: c.closed_at ? new Date(c.closed_at).toISOString() : undefined
    }));

    // Payments
    const paymentsRes = await client.query(
      `SELECT * FROM payments WHERE session_id = $1 ORDER BY created_at ASC`,
      [sessionUuid]
    );
    const payments: Payment[] = paymentsRes.rows.map((p) => ({
      id: p.id,
      sessionId: preferredId || (row.id as string),
      checkId: p.check_id || `chk_${row.id}`,
      provider: p.provider,
      providerReference: p.provider_reference ?? undefined,
      amountCents: p.amount_cents,
      tipCents: p.tip_cents || 0,
      method: "card",
      status: p.status as PaymentStatus,
      actorType: "guest",
      createdAt: new Date(p.created_at).toISOString()
    }));

    // Audit Events
    const eventsRes = await client.query(
      `SELECT * FROM audit_events WHERE session_id = $1 ORDER BY occurred_at ASC`,
      [sessionUuid]
    );
    const events: DomainEvent[] = eventsRes.rows.map((e) => ({
      id: e.id,
      restaurantId: (row.organization_id as string) || "sic_pizza_org",
      locationId: e.location_id,
      sessionId: preferredId || (row.id as string),
      aggregateType: (e.aggregate_type || "session") as DomainEvent["aggregateType"],
      aggregateId: e.aggregate_id,
      type: e.type,
      actorType: e.actor_type,
      actorId: e.actor_id ?? undefined,
      payload: (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>,
      idempotencyKey: e.idempotency_key ?? undefined,
      timestamp: new Date(e.occurred_at).toISOString()
    }));

    return {
      id: preferredId || row.id,
      restaurantId: preferredContext?.organizationId || row.organization_id || "sic_pizza_org",
      locationId: preferredContext?.locationId || row.location_id || "loc_downtown",
      tableId: row.table_id,
      tableLabel: row.table_label || "Table",
      diningAreaId: row.dining_area_id || "area_main",
      servicePeriodId: row.service_period_id || undefined,
      openedByEmployeeId: row.opened_by,
      assignedServerId: row.assigned_server_id || undefined,
      assistingEmployeeIds: Array.isArray(row.assisting_employee_ids) ? row.assisting_employee_ids : [],
      manualStageOverride: (row.manual_stage_override as DiningStage) || undefined,
      joinTokenHash: row.join_token_hash,
      openedAt: new Date(row.opened_at).toISOString(),
      closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : undefined,
      diners,
      items,
      tickets,
      requests,
      checks,
      payments,
      events,
      version: row.version || 1,
      executedIdempotencyKeys: {}
    };

  }


  async commitSessionTransaction(
    ctx: TenantContext,
    params: CommitTransactionParams
  ): Promise<TableSession> {
    const { session, expectedVersion, events = [], idempotency, outboxEvents = [] } = params;
    const sessionUuid = ensureUuid(session.id);
    const orgUuid = ensureUuid(ctx.organizationId || session.restaurantId || "org_default");
    const locUuid = ensureUuid(ctx.locationId || session.locationId || "loc_default");
    const tableUuid = ensureUuid(session.tableId);
    const openedByUuid = ensureUuid(session.openedByEmployeeId || "emp_system");
    const assignedServerUuid = session.assignedServerId ? ensureUuid(session.assignedServerId) : null;
    const diningAreaUuid = session.diningAreaId ? ensureUuid(session.diningAreaId) : null;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Concurrency and Lock Check
      const existingRes = await client.query(
        `SELECT version, closed_at FROM table_sessions
         WHERE id = $1 AND organization_id = $2 AND location_id = $3
         FOR UPDATE`,
        [sessionUuid, orgUuid, locUuid]
      );

      if (existingRes.rows.length > 0) {
        const currentVersion = existingRes.rows[0].version;
        if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
          throw new Error(`Concurrency conflict: expected session version ${expectedVersion} but found ${currentVersion}`);
        }
      } else {
        // Enforce active session per table constraint
        const activeTableRes = await client.query(
          `SELECT id FROM table_sessions
           WHERE table_id = $1 AND organization_id = $2 AND location_id = $3 AND closed_at IS NULL`,
          [tableUuid, orgUuid, locUuid]
        );
        if (activeTableRes.rows.length > 0) {
          throw new Error(`Table ${session.tableLabel} is already occupied by active session ${activeTableRes.rows[0].id}`);
        }
      }

      // 2. Idempotency Check & Record
      if (idempotency) {
        const reqHash = hashPayload(idempotency.requestPayload);
        const existingIdem = await client.query(
          `SELECT request_hash, response_payload FROM idempotency_records 
           WHERE organization_id = $1 AND location_id = $2 AND principal_id = $3 AND idempotency_key = $4`,
          [orgUuid, locUuid, idempotency.principalId, idempotency.key]
        );

        if (existingIdem.rows.length > 0) {
          if (existingIdem.rows[0].request_hash !== reqHash) {
            throw new Error(`Idempotency conflict: key '${idempotency.key}' previously used with different payload`);
          }
        } else {
          await client.query(
            `INSERT INTO idempotency_records (organization_id, location_id, principal_id, idempotency_key, request_hash, status, response_payload)
             VALUES ($1, $2, $3, $4, $5, 'completed', $6)`,
            [
              orgUuid,
              locUuid,
              idempotency.principalId,
              idempotency.key,
              reqHash,
              JSON.stringify(idempotency.responsePayload ?? {})
            ]
          );
        }

        if (!session.executedIdempotencyKeys) session.executedIdempotencyKeys = {};
        session.executedIdempotencyKeys[idempotency.key] = idempotency.responsePayload;
      }

      // Increment aggregate version
      const newVersion = (session.version || 0) + 1;
      session.version = newVersion;

      // 3. Upsert parent table_sessions record FIRST (foreign key integrity)
      await client.query(
        `INSERT INTO table_sessions (
           id, organization_id, location_id, table_id, dining_area_id, opened_by, 
           assigned_server_id, assisting_employee_ids, manual_stage_override, join_token_hash, 
           version, opened_at, closed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET 
           assigned_server_id = EXCLUDED.assigned_server_id,
           assisting_employee_ids = EXCLUDED.assisting_employee_ids,
           manual_stage_override = EXCLUDED.manual_stage_override,
           version = EXCLUDED.version,
           closed_at = EXCLUDED.closed_at`,
        [
          sessionUuid,
          orgUuid,
          locUuid,
          tableUuid,
          diningAreaUuid,
          openedByUuid,
          assignedServerUuid,
          JSON.stringify(session.assistingEmployeeIds || []),
          session.manualStageOverride || null,
          session.joinTokenHash,
          newVersion,
          session.openedAt,
          session.closedAt || null
        ]
      );

      // Ensure root Order exists
      const orderUuid = ensureUuid(`order_${session.id}`);
      await client.query(
        `INSERT INTO orders (id, session_id, status, subtotal_cents, tax_cents, total_cents, version)
         VALUES ($1, $2, 'draft', 0, 0, 0, 1)
         ON CONFLICT (id) DO NOTHING`,
        [orderUuid, sessionUuid]
      );

      // 4. Upsert Diners
      for (const diner of session.diners) {
        const dinerUuid = ensureUuid(diner.id);
        await client.query(
          `INSERT INTO diners (id, session_id, display_name, seat_number, is_guest_user, joined_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET 
             display_name = EXCLUDED.display_name,
             seat_number = EXCLUDED.seat_number`,
          [dinerUuid, sessionUuid, diner.displayName, diner.seatNumber || null, diner.isGuestUser, diner.joinedAt]
        );
      }

      // 5. Upsert Order Items
      for (const item of session.items) {
        const itemUuid = ensureUuid(item.id);
        const itemDinerUuid = item.dinerId ? ensureUuid(item.dinerId) : null;
        const confirmedByUuid = item.confirmedByEmployeeId ? ensureUuid(item.confirmedByEmployeeId) : null;

        await client.query(
          `INSERT INTO order_items (
             id, order_id, diner_id, name, course, station_id, status, quantity, 
             unit_price_cents, selected_modifiers, configuration, special_instructions, 
             confirmed_by_employee_id, void_reason
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET 
             status = EXCLUDED.status,
             quantity = EXCLUDED.quantity,
             selected_modifiers = EXCLUDED.selected_modifiers,
             configuration = EXCLUDED.configuration,
             special_instructions = EXCLUDED.special_instructions,
             confirmed_by_employee_id = EXCLUDED.confirmed_by_employee_id,
             void_reason = EXCLUDED.void_reason`,
          [
            itemUuid,
            orderUuid,
            itemDinerUuid,
            item.name,
            item.course || "mains",
            item.stationId || "kitchen",
            item.status,
            item.quantity,
            item.basePriceCents,
            JSON.stringify(item.selectedModifiers || []),
            JSON.stringify({
              splitMode: item.splitMode,
              assignedDinerIds: item.assignedDinerIds,
              customShares: item.customShares
            }),
            item.specialInstructions || null,
            confirmedByUuid,
            item.voidReason || null
          ]
        );
      }

      // 6. Upsert Kitchen Tickets
      for (const ticket of session.tickets) {
        const ticketUuid = ensureUuid(ticket.id);
        await client.query(
          `INSERT INTO kitchen_tickets (
             id, session_id, order_id, station_id, course, status, items, 
             created_at, accepted_at, ready_at, delivered_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET 
             status = EXCLUDED.status,
             items = EXCLUDED.items,
             accepted_at = EXCLUDED.accepted_at,
             ready_at = EXCLUDED.ready_at,
             delivered_at = EXCLUDED.delivered_at`,
          [
            ticketUuid,
            sessionUuid,
            orderUuid,
            ticket.stationId,
            ticket.course,
            ticket.status,
            JSON.stringify(ticket.items),
            ticket.createdAt,
            ticket.acceptedAt || null,
            ticket.readyAt || null,
            ticket.deliveredAt || null
          ]
        );
      }

      // 7. Upsert Guest Requests
      for (const req of session.requests) {
        const reqUuid = ensureUuid(req.id);
        const reqDinerUuid = req.dinerId ? ensureUuid(req.dinerId) : null;
        await client.query(
          `INSERT INTO guest_requests (
             id, session_id, table_id, diner_id, type, status, notes, 
             requested_at, acknowledged_at, completed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET 
             status = EXCLUDED.status,
             acknowledged_at = EXCLUDED.acknowledged_at,
             completed_at = EXCLUDED.completed_at`,
          [
            reqUuid,
            sessionUuid,
            tableUuid,
            reqDinerUuid,
            req.type || req.category,
            req.status.toLowerCase(),
            req.notes || null,
            req.createdAt || new Date().toISOString(),
            req.acknowledgedAt || null,
            req.completedAt || null

          ]
        );
      }

      // 8. Upsert Checks
      for (const chk of session.checks) {
        const checkUuid = ensureUuid(chk.id);
        await client.query(
          `INSERT INTO checks (
             id, session_id, title, diner_ids, items, subtotal_cents, tax_cents, 
             tip_cents, total_cents, paid_cents, balance_cents, status, created_at, closed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET 
             subtotal_cents = EXCLUDED.subtotal_cents,
             tax_cents = EXCLUDED.tax_cents,
             tip_cents = EXCLUDED.tip_cents,
             total_cents = EXCLUDED.total_cents,
             paid_cents = EXCLUDED.paid_cents,
             balance_cents = EXCLUDED.balance_cents,
             status = EXCLUDED.status,
             closed_at = EXCLUDED.closed_at`,
          [
            checkUuid,
            sessionUuid,
            chk.title,
            JSON.stringify(chk.dinerIds),
            JSON.stringify(chk.items),
            chk.subtotalCents,
            chk.taxCents,
            chk.tipCents,
            chk.totalCents,
            chk.paidCents,
            chk.balanceCents,
            chk.status,
            chk.createdAt,
            chk.closedAt || null
          ]
        );
      }

      // 9. Upsert Payments
      for (const p of session.payments) {
        const paymentUuid = ensureUuid(p.id);
        const checkUuid = p.checkId ? ensureUuid(p.checkId) : null;
        await client.query(
          `INSERT INTO payments (
             id, check_id, order_id, session_id, provider, provider_reference, 
             amount_cents, tip_cents, status, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET 
             status = EXCLUDED.status`,
          [
            paymentUuid,
            checkUuid,
            orderUuid,
            sessionUuid,
            p.provider,
            p.providerReference || null,
            p.amountCents,
            p.tipCents,
            p.status,
            p.createdAt
          ]
        );
      }

      // 10. Insert Audit Events (Parent session row exists!)
      for (const ev of events) {
        const evUuid = ensureUuid(ev.id);
        await client.query(
          `INSERT INTO audit_events (
             id, location_id, session_id, aggregate_type, aggregate_id, type, 
             actor_type, actor_id, payload, idempotency_key, occurred_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [
            evUuid,
            locUuid,
            sessionUuid,
            ev.aggregateType,
            ev.aggregateId,
            ev.type,
            ev.actorType,
            ev.actorId || null,
            JSON.stringify(ev.payload),
            ev.idempotencyKey || null,
            ev.timestamp
          ]
        );
      }

      // 11. Insert Outbox Events
      for (const ob of outboxEvents) {
        await client.query(
          `INSERT INTO outbox_events (organization_id, location_id, session_id, event_type, payload, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [orgUuid, locUuid, sessionUuid, ob.eventType, JSON.stringify(ob.payload)]
        );
      }

      await client.query("COMMIT");
      return session;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getIdempotencyResult<T>(
    ctx: TenantContext,
    principalId: string,
    key: string,
    requestPayload: unknown
  ): Promise<IdempotencyCheckResult<T>> {
    const locUuid = ensureUuid(ctx.locationId);
    if (!ctx.organizationId) {
      throw new Error("PostgreSQL idempotency access requires organizationId");
    }
    const orgUuid = ensureUuid(ctx.organizationId);
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT request_hash, response_payload FROM idempotency_records 
         WHERE organization_id = $1 AND location_id = $2 AND principal_id = $3 AND idempotency_key = $4`,
        [orgUuid, locUuid, principalId, key]
      );

      if (res.rows.length === 0) {
        return { exists: false };
      }

      const currentHash = hashPayload(requestPayload);
      if (res.rows[0].request_hash !== currentHash) {
        return { exists: true, conflict: true };
      }

      return {
        exists: true,
        cachedResult: res.rows[0].response_payload as T,
        conflict: false
      };
    } finally {
      client.release();
    }
  }

  async getEvents(ctxOrSessionId: TenantContext | string, maybeSessionId?: string): Promise<DomainEvent[]> {
    const { ctx, id: rawSessionId } = this.normalizeContext(ctxOrSessionId, maybeSessionId);
    const sessionUuid = ensureUuid(rawSessionId);
    const locationUuid = ensureUuid(ctx.locationId);
    const organizationUuid = ensureUuid(ctx.organizationId!);

    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `SELECT ae.* FROM audit_events ae
         JOIN table_sessions ts ON ts.id = ae.session_id
         WHERE ae.session_id = $1 AND ts.organization_id = $2 AND ae.location_id = $3
         ORDER BY occurred_at ASC`,
        [sessionUuid, organizationUuid, locationUuid]
      );

      return res.rows.map((e) => {
        const payloadObj = (typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload) as Record<string, unknown>;
        return {
          id: e.id,
          restaurantId: (payloadObj?.restaurantId as string) || "sic_pizza_org",
          locationId: e.location_id,
          sessionId: rawSessionId,
          aggregateType: (e.aggregate_type || "session") as DomainEvent["aggregateType"],
          aggregateId: e.aggregate_id,
          type: e.type,
          actorType: e.actor_type,
          actorId: e.actor_id ?? undefined,
          payload: payloadObj,
          idempotencyKey: e.idempotency_key ?? undefined,
          timestamp: new Date(e.occurred_at).toISOString()
        };
      });



    } finally {
      client.release();
    }
  }

  async save(session: TableSession): Promise<void> {
    await this.commitSessionTransaction(
      { organizationId: session.restaurantId, locationId: session.locationId },
      { session }
    );
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    const evUuid = ensureUuid(event.id);
    const sessionUuid = ensureUuid(event.sessionId);
    const locUuid = ensureUuid(event.locationId || "loc_default");

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO audit_events (
           id, location_id, session_id, aggregate_type, aggregate_id, type, 
           actor_type, actor_id, payload, idempotency_key, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          evUuid,
          locUuid,
          sessionUuid,
          event.aggregateType,
          event.aggregateId,
          event.type,
          event.actorType,
          event.actorId || null,
          JSON.stringify(event.payload),
          event.idempotencyKey || null,
          event.timestamp
        ]
      );
    } finally {
      client.release();
    }
  }
}
