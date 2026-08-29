import type { TableSession } from "../models/session";
import type { DomainEvent } from "../models/events";

export interface TableSessionRepository {
  findById(sessionId: string): Promise<TableSession | null>;
  findByTableId(tableId: string): Promise<TableSession | null>;
  listActive(locationId: string): Promise<TableSession[]>;
  save(session: TableSession): Promise<void>;
  appendEvent(event: DomainEvent): Promise<void>;
  getEvents(sessionId: string): Promise<DomainEvent[]>;
}

export class InMemoryTableSessionRepository implements TableSessionRepository {
  private sessions = new Map<string, TableSession>();
  private eventsBySession = new Map<string, DomainEvent[]>();

  async findById(sessionId: string): Promise<TableSession | null> {
    const s = this.sessions.get(sessionId);
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  async findByTableId(tableId: string): Promise<TableSession | null> {
    for (const session of this.sessions.values()) {
      if (session.tableId === tableId && !session.closedAt) {
        return JSON.parse(JSON.stringify(session));
      }
    }
    return null;
  }

  async listActive(locationId: string): Promise<TableSession[]> {
    const result: TableSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.locationId === locationId && !session.closedAt) {
        result.push(JSON.parse(JSON.stringify(session)));
      }
    }
    return result;
  }

  async save(session: TableSession): Promise<void> {
    this.sessions.set(session.id, JSON.parse(JSON.stringify(session)));
  }

  async appendEvent(event: DomainEvent): Promise<void> {
    const list = this.eventsBySession.get(event.sessionId) || [];
    list.push(JSON.parse(JSON.stringify(event)));
    this.eventsBySession.set(event.sessionId, list);
  }

  async getEvents(sessionId: string): Promise<DomainEvent[]> {
    const list = this.eventsBySession.get(sessionId) || [];
    return JSON.parse(JSON.stringify(list));
  }
}
