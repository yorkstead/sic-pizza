import {
  type TableSessionRepository,
  InMemoryTableSessionRepository,
  TableSessionService
} from "../domain";
import { PostgresTableSessionRepository } from "../domain/server";
import type { TenantContext } from "../domain";

// Server-side persistent session repository singleton
let globalRepo: TableSessionRepository | undefined;

interface SessionRepositoryRuntimeConfig {
  databaseUrl?: string;
  demoMode: boolean;
}

export function createServerSessionRepository(
  config: SessionRepositoryRuntimeConfig
): TableSessionRepository {
  if (config.databaseUrl) {
    return new PostgresTableSessionRepository({
      connectionString: config.databaseUrl
    });
  }

  if (config.demoMode) {
    return new InMemoryTableSessionRepository();
  }

  throw new Error(
    "Persistent session storage is not configured. Set DATABASE_URL, or explicitly enable SIC_DEMO_MODE=true for an isolated synthetic demo."
  );
}

export function getServerSessionRepository(): TableSessionRepository {
  if (globalRepo) return globalRepo;

  globalRepo = createServerSessionRepository({
    databaseUrl: process.env.DATABASE_URL,
    demoMode: process.env.SIC_DEMO_MODE === "true" || process.env.NODE_ENV === "test"
  });
  return globalRepo;
}

import { getRealtimeEventBus } from "./realtime/event-bus";

export function getServerSessionService(tenantContext: TenantContext): TableSessionService {
  return new TableSessionService(
    getServerSessionRepository(),
    (event, session) => {
      getRealtimeEventBus().publish(session.id, event, session.version || 1);
    },
    tenantContext
  );
}

export function resetServerSessionStore(repo?: TableSessionRepository): void {
  globalRepo = repo || new InMemoryTableSessionRepository();
}

