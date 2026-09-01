import {
  type TableSessionRepository,
  InMemoryTableSessionRepository,
  TableSessionService
} from "../domain";
import { PostgresTableSessionRepository } from "../domain/server";

// Server-side persistent session repository singleton
let globalRepo: TableSessionRepository | undefined;

export function getServerSessionRepository(): TableSessionRepository {
  if (globalRepo) return globalRepo;

  if (process.env.DATABASE_URL) {
    try {
      globalRepo = new PostgresTableSessionRepository({
        connectionString: process.env.DATABASE_URL
      });
      return globalRepo;
    } catch {
      // Fallback to in-memory if DB connection cannot be established
    }
  }

  // Persistent in-memory instance for dev and tests
  globalRepo = new InMemoryTableSessionRepository();
  return globalRepo;
}

import { getRealtimeEventBus } from "./realtime/event-bus";

export function getServerSessionService(): TableSessionService {
  return new TableSessionService(
    getServerSessionRepository(),
    (event, session) => {
      getRealtimeEventBus().publish(session.id, event, session.version || 1);
    }
  );
}

export function resetServerSessionStore(repo?: TableSessionRepository): void {
  globalRepo = repo || new InMemoryTableSessionRepository();
}

