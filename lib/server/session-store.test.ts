import { describe, expect, it } from "bun:test";
import { InMemoryTableSessionRepository } from "../domain";
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
});
