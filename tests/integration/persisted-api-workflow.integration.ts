import { afterAll, beforeAll, describe, expect, it, setDefaultTimeout } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { generateGuestJoinToken } from "../../lib/server/auth/guest-auth";
import { hashPin, STAFF_SESSION_COOKIE } from "../../lib/server/auth/staff-auth";
import { ensureUuid } from "../../lib/domain/utils/id-utils";

const port = 4317;
const baseUrl = `http://127.0.0.1:${port}`;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const staffSecret = process.env.TEST_STAFF_AUTH_SECRET ?? "synthetic-workflow-staff-secret";
const guestSecret = process.env.TEST_GUEST_AUTH_SECRET ?? "synthetic-workflow-guest-secret";

setDefaultTimeout(30_000);

function requireDisposableDatabaseUrl(): string {
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for the persisted API workflow");
  }
  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");
  }

  const parsed = new URL(testDatabaseUrl);
  const databaseName = parsed.pathname.slice(1).toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!local && !/(test|disposable|ci)(_|-|$)/.test(databaseName)) {
    throw new Error("The workflow database must be local or explicitly named test, disposable, or ci");
  }
  return testDatabaseUrl;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  expectedStatus = 200
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`
    );
  }
  return body as T;
}

describe("persisted staff and guest API workflow", () => {
  const databaseUrl = requireDisposableDatabaseUrl();
  const pool = new Pool({ connectionString: databaseUrl });
  const organizationId = ensureUuid("sic_pizza_org");
  const locationId = ensureUuid("loc_downtown");
  const employeeId = ensureUuid("emp_jordan");
  const diningAreaId = ensureUuid("area_main");
  const tableId = ensureUuid("tbl_workflow_11");
  let serverProcess: ReturnType<typeof Bun.spawn> | undefined;

  async function startServer(): Promise<void> {
    try {
      await fetch(baseUrl);
      throw new Error(`Test port ${port} is already occupied`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already occupied")) throw error;
    }

    serverProcess = Bun.spawn([
      process.execPath,
      "node_modules/next/dist/bin/next",
      "start",
      "-p",
      String(port)
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        STAFF_AUTH_SECRET: staffSecret,
        GUEST_AUTH_SECRET: guestSecret,
        SIC_DEMO_MODE: "false"
      },
      stdout: "pipe",
      stderr: "pipe"
    });

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (serverProcess.exitCode !== null) {
        const stderr = serverProcess.stderr instanceof ReadableStream
          ? await new Response(serverProcess.stderr).text()
          : "No captured stderr was available";
        throw new Error(`Next.js server exited during startup: ${stderr}`);
      }
      try {
        const response = await fetch(`${baseUrl}/api/staff/auth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: "invalid", locationId: "loc_downtown" })
        });
        if (response.status === 401) return;
      } catch {
        // Server is still starting.
      }
      await Bun.sleep(100);
    }
    throw new Error("Timed out waiting for the Next.js test server");
  }

  async function stopServer(): Promise<void> {
    if (!serverProcess || serverProcess.exitCode !== null) return;
    serverProcess.kill();
    await serverProcess.exited;
    serverProcess = undefined;
  }

  beforeAll(async () => {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await pool.query(
      `INSERT INTO organizations (id, name) VALUES ($1, 'Synthetic Workflow Organization')`,
      [organizationId]
    );
    await pool.query(
      `INSERT INTO locations (id, organization_id, name, timezone)
       VALUES ($1, $2, 'Synthetic Workflow Location', 'America/Denver')`,
      [locationId, organizationId]
    );
    await pool.query(
      `INSERT INTO dining_areas (id, location_id, name, code)
       VALUES ($1, $2, 'Synthetic Main Dining', 'SYNTH')`,
      [diningAreaId, locationId]
    );
    const staffPinHash = await hashPin("0420", "synthetic-workflow-salt");
    await pool.query(
      `INSERT INTO employees (id, location_id, display_name, pin_hash, role)
       VALUES ($1, $2, 'Jordan Synthetic Server', $3, 'server')`,
      [employeeId, locationId, staffPinHash]
    );
    await pool.query(
      `INSERT INTO tables (id, location_id, dining_area_id, label, seats)
       VALUES ($1, $2, $3, 'Workflow Table 11', 4)`,
      [tableId, locationId, diningAreaId]
    );
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
    await pool.query("DELETE FROM audit_events WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM outbox_events WHERE organization_id = $1", [organizationId]);
    await pool.query("DELETE FROM idempotency_records WHERE organization_id = $1", [organizationId]);
    await pool.query(
      "DELETE FROM kitchen_tickets WHERE session_id IN (SELECT id FROM table_sessions WHERE organization_id = $1)",
      [organizationId]
    );
    await pool.query(
      "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE organization_id = $1))",
      [organizationId]
    );
    await pool.query(
      "DELETE FROM orders WHERE session_id IN (SELECT id FROM table_sessions WHERE organization_id = $1)",
      [organizationId]
    );
    await pool.query(
      "DELETE FROM diners WHERE session_id IN (SELECT id FROM table_sessions WHERE organization_id = $1)",
      [organizationId]
    );
    await pool.query("DELETE FROM table_sessions WHERE organization_id = $1", [organizationId]);
    await pool.query("DELETE FROM tables WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM staff_login_attempts WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM staff_sessions WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM staff_devices WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM employees WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM dining_areas WHERE location_id = $1", [locationId]);
    await pool.query("DELETE FROM locations WHERE id = $1", [locationId]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    await pool.end();
  });

  it("persists a staff-opened table through guest activity, kitchen firing, and restart", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/staff/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "0420", locationId: "loc_downtown", employeeId: "emp_jordan" })
    });
    expect(loginResponse.status).toBe(200);
    const staffAuth = await loginResponse.json() as { token?: string; employee: { organizationId: string; locationId: string } };
    expect(staffAuth.token).toBeUndefined();
    const setCookie = loginResponse.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.match(new RegExp(`${STAFF_SESSION_COOKIE}=([^;,]+)`));
    expect(sessionCookie?.[1]).toBeDefined();
    const staffHeaders = {
      "Content-Type": "application/json",
      Cookie: `${STAFF_SESSION_COOKIE}=${sessionCookie![1]}`
    };

    const opened = await requestJson<{ session: { id: string; tableId: string } }>(
      "/api/staff/sessions",
      {
        method: "POST",
        headers: staffHeaders,
        body: JSON.stringify({
          tableId: "tbl_workflow_11",
          tableLabel: "Workflow Table 11",
          diningAreaId: "area_main"
        })
      }
    );

    const joinToken = await generateGuestJoinToken({
      sessionId: opened.session.id,
      tableId: opened.session.tableId,
      tableLabel: "Workflow Table 11",
      locationId: "loc_downtown",
      organizationId: "sic_pizza_org"
    });
    const joined = await requestJson<{
      guestToken: string;
      diner: { id: string };
    }>("/api/guest/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenOrCode: joinToken, dinerName: "Synthetic Guest" })
    });
    const guestHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${joined.guestToken}`
    };

    const proposed = await requestJson<{
      result: { item: { id: string; status: string } };
    }>("/api/guest/actions", {
      method: "POST",
      headers: guestHeaders,
      body: JSON.stringify({
        action: "propose_item",
        idempotencyKey: "workflow-proposal-1",
        payload: {
          menuItemId: "synthetic-margherita",
          name: "Synthetic Margherita",
          course: "mains",
          stationId: "pizza",
          basePriceCents: 1800,
          selectedModifiers: []
        }
      })
    });
    expect(proposed.result.item.status).toBe("proposed");

    await requestJson(`/api/staff/sessions/${opened.session.id}/action`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        action: "approve_proposal",
        idempotencyKey: "workflow-approval-1",
        payload: { orderItemId: proposed.result.item.id }
      })
    });
    const fired = await requestJson<{
      result: { tickets: Array<{ id: string }> };
    }>(`/api/staff/sessions/${opened.session.id}/action`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        action: "fire_course",
        idempotencyKey: "workflow-fire-1",
        payload: { course: "mains" }
      })
    });
    expect(fired.result.tickets).toHaveLength(1);

    await stopServer();
    await startServer();

    const afterRestart = await requestJson<{
      sessions: Array<{ id: string; tickets: Array<{ id: string }> }>;
    }>("/api/staff/sessions", { headers: staffHeaders });
    const persisted = afterRestart.sessions.find((session) => session.id === opened.session.id);
    expect(persisted?.tickets).toHaveLength(1);
    expect(persisted?.tickets[0].id).toBe(fired.result.tickets[0].id);

    const retried = await requestJson<{
      result: { tickets: Array<{ id: string }> };
    }>(`/api/staff/sessions/${opened.session.id}/action`, {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({
        action: "fire_course",
        idempotencyKey: "workflow-fire-1",
        payload: { course: "mains" }
      })
    });
    expect(retried.result.tickets).toHaveLength(1);
    expect(retried.result.tickets[0].id).toBe(fired.result.tickets[0].id);

    await requestJson("/api/staff/auth", { method: "DELETE", headers: staffHeaders });
    await requestJson("/api/staff/sessions", { headers: staffHeaders }, 403);
  });
});
