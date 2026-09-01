"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DomainEvent } from "@/lib/domain";

export interface RealtimeEnvelope {
  seq: number;
  sessionId: string;
  locationId?: string;
  sessionVersion: number;
  timestamp: string;
  event: DomainEvent;
}

export interface UseTableRealtimeOptions {
  sessionId?: string;
  locationId?: string;
  token?: string | null;
  enabled?: boolean;
  onEvent?: (envelope: RealtimeEnvelope) => void;
  onSyncRequired?: () => void | Promise<void>;
  pollIntervalMs?: number;
}

export function useTableRealtime({
  sessionId,
  locationId,
  token,
  enabled = true,
  onEvent,
  onSyncRequired,
  pollIntervalMs = 3000
}: UseTableRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastSeq, setLastSeq] = useState(0);
  const [fallbackActive, setFallbackActive] = useState(false);

  const lastSeqRef = useRef(0);
  const onEventRef = useRef(onEvent);
  const onSyncRef = useRef(onSyncRequired);
  const errorCountRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    lastSeqRef.current = lastSeq;
  }, [lastSeq]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onSyncRef.current = onSyncRequired;
  }, [onSyncRequired]);

  const triggerFullSync = useCallback(async () => {
    if (onSyncRef.current) {
      try {
        await onSyncRef.current();
      } catch (err) {
        console.error("Failed to perform realtime state sync:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !token || (!sessionId && !locationId)) {
      return;
    }

    let eventSource: EventSource | null = null;
    let isCancelled = false;

    function connect() {
      if (isCancelled) return;

      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      if (locationId) params.set("locationId", locationId);
      if (lastSeqRef.current > 0) params.set("sinceSeq", String(lastSeqRef.current));
      params.set("token", token!);

      const url = `/api/realtime/events?${params.toString()}`;

      try {
        eventSource = new EventSource(url);

        eventSource.addEventListener("connected", () => {
          if (isCancelled) return;
          setConnected(true);
          setReconnecting(false);
          setFallbackActive(false);
          errorCountRef.current = 0;
        });

        eventSource.addEventListener("event", (e: MessageEvent) => {
          if (isCancelled) return;
          try {
            const envelope: RealtimeEnvelope = JSON.parse(e.data);
            const expectedSeq = lastSeqRef.current + 1;

            if (lastSeqRef.current > 0 && envelope.seq > expectedSeq) {
              // Sequence gap detected: missed intermediate events!
              console.warn(
                `Realtime sequence gap detected (expected ${expectedSeq}, got ${envelope.seq}). Triggering full sync.`
              );
              setLastSeq(envelope.seq);
              triggerFullSync();
            } else {
              setLastSeq(envelope.seq);
              if (onEventRef.current) {
                onEventRef.current(envelope);
              }
            }
          } catch (err) {
            console.error("Failed to parse realtime event envelope:", err);
          }
        });

        eventSource.addEventListener("sync_required", () => {
          if (isCancelled) return;
          triggerFullSync();
        });

        eventSource.addEventListener("ping", () => {
          // Heartbeat received
        });

        eventSource.onerror = () => {
          if (isCancelled) return;
          setConnected(false);
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          errorCountRef.current += 1;
          // After 3 failed reconnects, activate fallback polling
          if (errorCountRef.current >= 3) {
            setFallbackActive(true);
          }

          // Exponential backoff: 1s, 2s, 4s, 8s, max 16s
          const delay = Math.min(1000 * Math.pow(2, errorCountRef.current - 1), 16000);
          setReconnecting(true);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isCancelled) {
              triggerFullSync();
              connect();
            }
          }, delay);
        };
      } catch {
        setFallbackActive(true);
      }
    }

    connect();

    return () => {
      isCancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSource) {
        eventSource.close();
      }
      setConnected(false);
      setReconnecting(false);
    };
  }, [sessionId, locationId, token, enabled, triggerFullSync]);

  // Fallback Polling when SSE is unavailable or reconnecting repeatedly
  useEffect(() => {
    if (!fallbackActive || !enabled || (!sessionId && !locationId)) return;

    const interval = setInterval(() => {
      triggerFullSync();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [fallbackActive, enabled, sessionId, locationId, pollIntervalMs, triggerFullSync]);

  return {
    connected,
    reconnecting,
    fallbackActive,
    lastSeq,
    triggerFullSync
  };
}
