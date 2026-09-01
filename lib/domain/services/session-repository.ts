import type { TableSession } from "../models/session";
import type { DomainEvent } from "../models/events";
import { hashPayload } from "../utils/id-utils";

export interface TenantContext {
  organizationId?: string;
  locationId: string;
}

export interface CommitTransactionParams {
  session: TableSession;
  expectedVersion?: number;
  events?: DomainEvent[];
  idempotency?: {
    key: string;
    principalId: string;
    requestPayload: unknown;
    responsePayload: unknown;
  };
  outboxEvents?: Array<{
    eventType: string;
    payload: unknown;
  }>;
}

export interface IdempotencyCheckResult<T = unknown> {
  exists: boolean;
  cachedResult?: T;
  conflict?: boolean;
}

export interface TableSessionRepository {
  findById(ctxOrSessionId: TenantContext | string, maybeSessionId?: string): Promise<TableSession | null>;
  findByTableId(ctxOrTableId: TenantContext | string, maybeTableId?: string): Promise<TableSession | null>;
  listActive(ctxOrLocationId: TenantContext | string): Promise<TableSession[]>;
  listAll(ctx?: TenantContext): Promise<TableSession[]>;
  
  commitSessionTransaction(
    ctx: TenantContext,
    params: CommitTransactionParams
  ): Promise<TableSession>;

  getIdempotencyResult<T>(
    ctx: TenantContext,
    principalId: string,
    key: string,
    requestPayload: unknown
  ): Promise<IdempotencyCheckResult<T>>;

  getEvents(ctxOrSessionId: TenantContext | string, maybeSessionId?: string): Promise<DomainEvent[]>;

  // Legacy convenience methods for backward compatibility
  save(session: TableSession): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
}

export class InMemoryTableSessionRepository implements TableSessionRepository {
  private sessions = new Map<string, TableSession>();
  private eventsBySession = new Map<string, DomainEvent[]>();
  private idempotencyStore = new Map<string, { requestHash: string; responsePayload: unknown; status: string }>();
  private outbox: Array<{ organizationId?: string; locationId: string; sessionId?: string; eventType: string; payload: unknown; createdAt: string }> = [];

  private normalizeContext(ctxOrId: TenantContext | string, maybeId?: string): { ctx: TenantContext | null; id: string } {
    if (typeof ctxOrId === "string") {
      return { ctx: null, id: ctxOrId };
    }
    return { ctx: ctxOrId, id: maybeId || "" };
  }

  async findById(ctxOrSessionId: TenantContext | string, maybeSessionId?: string): Promise<TableSession | null> {
    const { ctx, id } = this.normalizeContext(ctxOrSessionId, maybeSessionId);
    const s = this.sessions.get(id);
    if (!s) return null;
    if (ctx && ctx.locationId && s.locationId !== ctx.locationId) return null;
    if (ctx && ctx.organizationId && s.restaurantId !== ctx.organizationId) return null;
    return JSON.parse(JSON.stringify(s));
  }

  async findByTableId(ctxOrTableId: TenantContext | string, maybeTableId?: string): Promise<TableSession | null> {
    const { ctx, id: tableId } = this.normalizeContext(ctxOrTableId, maybeTableId);
    for (const session of this.sessions.values()) {
      if (session.tableId === tableId && !session.closedAt) {
        if (ctx && ctx.locationId && session.locationId !== ctx.locationId) continue;
        if (ctx && ctx.organizationId && session.restaurantId !== ctx.organizationId) continue;
        return JSON.parse(JSON.stringify(session));
      }
    }
    return null;
  }

  async listActive(ctxOrLocationId: TenantContext | string): Promise<TableSession[]> {
    const locationId = typeof ctxOrLocationId === "string" ? ctxOrLocationId : ctxOrLocationId.locationId;
    const organizationId = typeof ctxOrLocationId === "object" ? ctxOrLocationId.organizationId : undefined;
    const result: TableSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.locationId === locationId && !session.closedAt) {
        if (organizationId && session.restaurantId !== organizationId) continue;
        result.push(JSON.parse(JSON.stringify(session)));
      }
    }
    return result;
  }

  async listAll(ctx?: TenantContext): Promise<TableSession[]> {
    let list = Array.from(this.sessions.values());
    if (ctx?.locationId) {
      list = list.filter((s) => s.locationId === ctx.locationId);
    }
    if (ctx?.organizationId) {
      list = list.filter((s) => s.restaurantId === ctx.organizationId);
    }
    return list.map((s) => JSON.parse(JSON.stringify(s)));
  }

  async commitSessionTransaction(
    ctx: TenantContext,
    params: CommitTransactionParams
  ): Promise<TableSession> {
    const { session, expectedVersion, events = [], idempotency, outboxEvents = [] } = params;

    // Check concurrency version if session already exists
    const existing = this.sessions.get(session.id);
    if (existing) {
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        throw new Error(`Concurrency conflict: expected session version ${expectedVersion} but found ${existing.version}`);
      }
    } else {
      // Check single active session per table constraint
      for (const s of this.sessions.values()) {
        if (s.tableId === session.tableId && !s.closedAt && s.locationId === ctx.locationId && s.id !== session.id) {
          throw new Error(`Table ${session.tableLabel} is already occupied by active session ${s.id}`);
        }
      }
    }

    // Process idempotency if specified
    if (idempotency) {
      const scopedKey = `${ctx.locationId}:${idempotency.principalId}:${idempotency.key}`;
      const existingIdem = this.idempotencyStore.get(scopedKey);
      const reqHash = hashPayload(idempotency.requestPayload);

      if (existingIdem) {
        if (existingIdem.requestHash !== reqHash) {
          throw new Error(`Idempotency conflict: key '${idempotency.key}' previously used with different payload`);
        }
      } else {
        this.idempotencyStore.set(scopedKey, {
          requestHash: reqHash,
          responsePayload: idempotency.responsePayload ? JSON.parse(JSON.stringify(idempotency.responsePayload)) : undefined,
          status: "completed"
        });
      }

      if (!session.executedIdempotencyKeys) session.executedIdempotencyKeys = {};
      session.executedIdempotencyKeys[idempotency.key] = idempotency.responsePayload;
    }

    // Increment version
    session.version = (session.version || 0) + 1;

    // Save session
    const clonedSession: TableSession = JSON.parse(JSON.stringify(session));
    this.sessions.set(session.id, clonedSession);

    // Save events
    if (events.length > 0) {
      const list = this.eventsBySession.get(session.id) || [];
      for (const ev of events) {
        list.push(JSON.parse(JSON.stringify(ev)));
      }
      this.eventsBySession.set(session.id, list);
    }

    // Append outbox records
    for (const ob of outboxEvents) {
      this.outbox.push({
        organizationId: ctx.organizationId,
        locationId: ctx.locationId,
        sessionId: session.id,
        eventType: ob.eventType,
        payload: JSON.parse(JSON.stringify(ob.payload)),
        createdAt: new Date().toISOString()
      });
    }

    return JSON.parse(JSON.stringify(session));
  }

  async getIdempotencyResult<T>(
    ctx: TenantContext,
    principalId: string,
    key: string,
    requestPayload: unknown
  ): Promise<IdempotencyCheckResult<T>> {
    const scopedKey = `${ctx.locationId}:${principalId}:${key}`;
    const record = this.idempotencyStore.get(scopedKey);
    if (!record) {
      return { exists: false };
    }

    const currentHash = hashPayload(requestPayload);
    if (record.requestHash !== currentHash) {
      return { exists: true, conflict: true };
    }

    return {
      exists: true,
      cachedResult: record.responsePayload as T,
      conflict: false
    };
  }

  async getEvents(ctxOrSessionId: TenantContext | string, maybeSessionId?: string): Promise<DomainEvent[]> {
    const { id: sessionId } = this.normalizeContext(ctxOrSessionId, maybeSessionId);
    const list = this.eventsBySession.get(sessionId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async save(session: TableSession): Promise<void> {
    const cloned = JSON.parse(JSON.stringify(session));
    this.sessions.set(session.id, cloned);
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    const list = this.eventsBySession.get(event.sessionId) || [];
    list.push(JSON.parse(JSON.stringify(event)));
    this.eventsBySession.set(event.sessionId, list);
  }

  public getOutbox() {
    return [...this.outbox];
  }
}
