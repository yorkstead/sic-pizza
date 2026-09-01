import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { DomainEvent, TableSession } from "../../lib/domain";
import { PostgresTableSessionRepository } from "../../lib/domain/server";
import { ensureUuid } from "../../lib/domain/utils/id-utils";

const connectionString = process.env.TEST_DATABASE_URL;

function requireDisposableDatabaseUrl(): string {
  if (!connectionString) {
    throw new Error(
      "TEST_DATABASE_URL is required for PostgreSQL integration tests; the production DATABASE_URL is never used"
    );
  }

  if (connectionString === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  }

  const parsed = new URL(connectionString);
  const databaseName = parsed.pathname.slice(1).toLowerCase();
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  const isClearlyDisposable = /(test|disposable|ci)(_|-|$)/.test(databaseName);
  if (!isLocal && !isClearlyDisposable) {
    throw new Error(
      "TEST_DATABASE_URL must target localhost or a database whose name is explicitly marked test, disposable, or ci"
    );
  }

  return connectionString;
}

describe("PostgreSQL transactional persistence", () => {
  const runId = randomUUID();
  const organizationId = ensureUuid(`integration-org-${runId}`);
  const otherOrganizationId = ensureUuid(`integration-other-org-${runId}`);
  const locationId = ensureUuid(`integration-location-${runId}`);
  const otherLocationId = ensureUuid(`integration-other-location-${runId}`);
  const employeeId = ensureUuid(`integration-employee-${runId}`);
  const diningAreaId = ensureUuid(`integration-area-${runId}`);
  const tableId = ensureUuid(`integration-table-${runId}`);
  const concurrentTableId = ensureUuid(`integration-concurrent-table-${runId}`);
  const pool = new Pool({ connectionString: requireDisposableDatabaseUrl() });
  const repository = new PostgresTableSessionRepository({ pool });

  const tenant = { organizationId, locationId };
  const otherTenant = {
    organizationId: otherOrganizationId,
    locationId: otherLocationId
  };

  function session(id: string, targetTableId = tableId): TableSession {
    return {
      id,
      restaurantId: organizationId,
      locationId,
      tableId: targetTableId,
      tableLabel: "Integration Table",
      diningAreaId,
      openedByEmployeeId: employeeId,
      assignedServerId: employeeId,
      assistingEmployeeIds: [],
      joinTokenHash: `synthetic-${runId}`,
      openedAt: new Date().toISOString(),
      diners: [],
      items: [],
      tickets: [],
      requests: [],
      checks: [],
      payments: [],
      events: [],
      version: 0,
      executedIdempotencyKeys: {}
    };
  }

  beforeAll(async () => {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await pool.query(
      `INSERT INTO organizations (id, name) VALUES ($1, 'Integration Org'), ($2, 'Other Integration Org')`,
      [organizationId, otherOrganizationId]
    );
    await pool.query(
      `INSERT INTO locations (id, organization_id, name, timezone)
       VALUES ($1, $2, 'Integration Location', 'America/Denver'),
              ($3, $4, 'Other Integration Location', 'America/Denver')`,
      [locationId, organizationId, otherLocationId, otherOrganizationId]
    );
    await pool.query(
      `INSERT INTO dining_areas (id, location_id, name, code) VALUES ($1, $2, 'Integration', 'INT')`,
      [diningAreaId, locationId]
    );
    await pool.query(
      `INSERT INTO employees (id, location_id, display_name, pin_hash, role)
       VALUES ($1, $2, 'Synthetic Integration Employee', 'not-a-real-pin', 'admin')`,
      [employeeId, locationId]
    );
    await pool.query(
      `INSERT INTO tables (id, location_id, dining_area_id, label, seats)
       VALUES ($1, $2, $3, 'Integration Table', 4),
              ($4, $2, $3, 'Concurrent Integration Table', 4)`,
      [tableId, locationId, diningAreaId, concurrentTableId]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM audit_events WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM outbox_events WHERE organization_id = $1", [organizationId]);
    await pool.query("DELETE FROM idempotency_records WHERE organization_id = $1", [organizationId]);
    await pool.query(
      "DELETE FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE organization_id = $1)",
      [organizationId]
    );
    await pool.query("DELETE FROM table_sessions WHERE organization_id = $1", [organizationId]);
    await pool.query("DELETE FROM tables WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM employees WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM dining_areas WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM locations WHERE id IN ($1, $2)", [locationId, otherLocationId]);
    await pool.query("DELETE FROM organizations WHERE id IN ($1, $2)", [organizationId, otherOrganizationId]);
    await pool.end();
  });

  it("survives a separate repository connection and denies cross-tenant reads", async () => {
    const created = session(`restart-${runId}`);
    await repository.commitSessionTransaction(tenant, { session: created });

    const secondPool = new Pool({ connectionString: requireDisposableDatabaseUrl() });
    const secondRepository = new PostgresTableSessionRepository({ pool: secondPool });
    try {
      expect(await secondRepository.findById(tenant, created.id)).not.toBeNull();
      expect(await secondRepository.findById(otherTenant, created.id)).toBeNull();
    } finally {
      await secondPool.end();
    }
  });

  it("enforces one active session per tenant-location table under concurrency", async () => {
    const first = session(`concurrent-a-${runId}`, concurrentTableId);
    const second = session(`concurrent-b-${runId}`, concurrentTableId);
    const results = await Promise.allSettled([
      repository.commitSessionTransaction(tenant, { session: first }),
      repository.commitSessionTransaction(tenant, { session: second })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("rolls back the session when a later audit write fails", async () => {
    const created = session(`rollback-${runId}`);
    const invalidEvent = {
      id: `invalid-event-${runId}`,
      restaurantId: organizationId,
      locationId,
      sessionId: created.id,
      aggregateType: "session",
      aggregateId: created.id,
      type: "TABLE_OPENED",
      actorType: "invalid_actor",
      payload: {},
      timestamp: new Date().toISOString()
    } as unknown as DomainEvent;

    await expect(
      repository.commitSessionTransaction(tenant, {
        session: created,
        events: [invalidEvent]
      })
    ).rejects.toThrow();
    expect(await repository.findById(tenant, created.id)).toBeNull();
  });

  it("persists idempotency responses and rejects conflicting key reuse", async () => {
    const created = session(`idempotency-${runId}`);
    await repository.commitSessionTransaction(tenant, {
      session: created,
      idempotency: {
        key: `key-${runId}`,
        principalId: employeeId,
        requestPayload: { action: "open", tableId },
        responsePayload: { sessionId: created.id }
      }
    });

    const cached = await repository.getIdempotencyResult<{ sessionId: string }>(
      tenant,
      employeeId,
      `key-${runId}`,
      { action: "open", tableId }
    );
    expect(cached.cachedResult?.sessionId).toBe(created.id);

    const conflict = await repository.getIdempotencyResult(
      tenant,
      employeeId,
      `key-${runId}`,
      { action: "open", tableId: "different" }
    );
    expect(conflict.conflict).toBe(true);
  });
});
