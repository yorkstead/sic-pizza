/**
 * Server-Authoritative Realtime Event Bus & Stream Hub.
 * Manages in-process subscriber connections, sequence numbers, heartbeat, and reconnection replay buffers.
 */

import type { DomainEvent } from "@/lib/domain";

export interface RealtimeEnvelope {
  seq: number;
  sessionId: string;
  locationId?: string;
  sessionVersion: number;
  timestamp: string;
  event: DomainEvent;
}

export type RealtimeSubscriber = (envelope: RealtimeEnvelope) => void;

export class RealtimeEventBus {
  private subscribersBySession = new Map<string, Set<RealtimeSubscriber>>();
  private floorSubscribers = new Map<string, Set<RealtimeSubscriber>>();
  private eventHistoryBySession = new Map<string, RealtimeEnvelope[]>();
  private currentSeqBySession = new Map<string, number>();
  private maxHistoryPerSession = 500;

  /**
   * Publishes an event to all subscribers of a session and floor, buffering for replay.
   */
  publish(sessionId: string, event: DomainEvent, sessionVersion: number): RealtimeEnvelope {
    const nextSeq = (this.currentSeqBySession.get(sessionId) || 0) + 1;
    this.currentSeqBySession.set(sessionId, nextSeq);

    const envelope: RealtimeEnvelope = {
      seq: nextSeq,
      sessionId,
      locationId: event.locationId,
      sessionVersion,
      timestamp: new Date().toISOString(),
      event
    };

    // Buffer in memory for replay
    if (!this.eventHistoryBySession.has(sessionId)) {
      this.eventHistoryBySession.set(sessionId, []);
    }
    const history = this.eventHistoryBySession.get(sessionId)!;
    history.push(envelope);
    if (history.length > this.maxHistoryPerSession) {
      history.shift();
    }

    // 1. Notify session-specific subscribers
    const sessionSubs = this.subscribersBySession.get(sessionId);
    if (sessionSubs) {
      for (const subscriber of sessionSubs) {
        try {
          subscriber(envelope);
        } catch (err) {
          console.error("Error dispatching to session subscriber:", err);
        }
      }
    }

    // 2. Notify floor-wide subscribers
    if (event.locationId) {
      const floorSubs = this.floorSubscribers.get(event.locationId);
      if (floorSubs) {
        for (const subscriber of floorSubs) {
          try {
            subscriber(envelope);
          } catch (err) {
            console.error("Error dispatching to floor subscriber:", err);
          }
        }
      }
    }

    return envelope;
  }

  /**
   * Subscribes to events for a specific session.
   * Returns an unsubscribe function.
   */
  subscribeSession(sessionId: string, subscriber: RealtimeSubscriber): () => void {
    if (!this.subscribersBySession.has(sessionId)) {
      this.subscribersBySession.set(sessionId, new Set());
    }
    const subs = this.subscribersBySession.get(sessionId)!;
    subs.add(subscriber);

    return () => {
      subs.delete(subscriber);
      if (subs.size === 0) {
        this.subscribersBySession.delete(sessionId);
      }
    };
  }

  /**
   * Subscribes to floor-wide events for a location.
   */
  subscribeFloor(locationId: string, subscriber: RealtimeSubscriber): () => void {
    if (!this.floorSubscribers.has(locationId)) {
      this.floorSubscribers.set(locationId, new Set());
    }
    const subs = this.floorSubscribers.get(locationId)!;
    subs.add(subscriber);

    return () => {
      subs.delete(subscriber);
      if (subs.size === 0) {
        this.floorSubscribers.delete(locationId);
      }
    };
  }

  /**
   * Retrieves missed events since a specific sequence number for reconnection recovery.
   */
  getMissedEvents(
    sessionId: string,
    sinceSeq: number
  ): {
    reconciled: boolean;
    events: RealtimeEnvelope[];
    currentSeq: number;
    requiresFullSync: boolean;
  } {
    const currentSeq = this.currentSeqBySession.get(sessionId) || 0;
    if (sinceSeq >= currentSeq) {
      return { reconciled: true, events: [], currentSeq, requiresFullSync: false };
    }

    const history = this.eventHistoryBySession.get(sessionId) || [];
    if (history.length === 0) {
      return { reconciled: false, events: [], currentSeq, requiresFullSync: true };
    }

    const earliestSeq = history[0].seq;
    // If client is further behind than buffer, client must do full state sync
    if (sinceSeq < earliestSeq - 1) {
      return { reconciled: false, events: [], currentSeq, requiresFullSync: true };
    }

    const missed = history.filter((e) => e.seq > sinceSeq);
    return {
      reconciled: true,
      events: missed,
      currentSeq,
      requiresFullSync: false
    };
  }

  /**
   * Resets all subscriber state (for test isolation).
   */
  reset(): void {
    this.subscribersBySession.clear();
    this.floorSubscribers.clear();
    this.eventHistoryBySession.clear();
    this.currentSeqBySession.clear();
  }
}

// Global server singleton
let globalEventBus: RealtimeEventBus | null = null;

export function getRealtimeEventBus(): RealtimeEventBus {
  if (!globalEventBus) {
    globalEventBus = new RealtimeEventBus();
  }
  return globalEventBus;
}
