import { describe, expect, it } from "bun:test";
import { InMemoryTableSessionRepository, TableSessionService } from "../domain";
import { PostgresTableSessionRepository } from "../domain/server";
import { createServerSessionRepository } from "./session-store";

describe("server session repository runtime selection", () => {
  it("fails closed when persistent storage and explicit demo mode are absent", () => {
    expect(() =>
      createServerSessionRepository({ databaseUrl: undefined, demoMode: false })
    ).toThrow(/Persistent session storage is not configured/);
  });

  it("uses memory only when isolated demo mode is explicit", () => {
    const repository = createServerSessionRepository({
      databaseUrl: undefined,
      demoMode: true
    });

    expect(repository).toBeInstanceOf(InMemoryTableSessionRepository);
  });

  it("selects PostgreSQL whenever a database URL is configured", async () => {
    const repository = createServerSessionRepository({
      databaseUrl: "postgres://user:password@127.0.0.1:5432/disposable_test",
      demoMode: true
    });

    expect(repository).toBeInstanceOf(PostgresTableSessionRepository);
    await (repository as PostgresTableSessionRepository).close();
  });

  it("prevents a tenant-bound service from opening or reading another tenant's session", async () => {
    const repository = new InMemoryTableSessionRepository();
    const tenantA = {
      organizationId: "org-a",
      locationId: "location-a"
    };
    const tenantB = {
      organizationId: "org-b",
      locationId: "location-b"
    };
    const serviceA = new TableSessionService(repository, undefined, tenantA);
    const serviceB = new TableSessionService(repository, undefined, tenantB);

    const { session } = await serviceA.openTableSession({
      restaurantId: tenantA.organizationId,
      locationId: tenantA.locationId,
      tableId: "table-a",
      tableLabel: "Table A",
      diningAreaId: "main",
      openedByEmployeeId: "employee-a"
    });

    await expect(
      serviceB.addDiner(session.id, "Cross Tenant Guest")
    ).rejects.toThrow(/not found/);
    await expect(
      serviceA.openTableSession({
        restaurantId: tenantB.organizationId,
        locationId: tenantB.locationId,
        tableId: "table-b",
        tableLabel: "Table B",
        diningAreaId: "main",
        openedByEmployeeId: "employee-b"
      })
    ).rejects.toThrow(/Tenant context does not match/);
  });
});
