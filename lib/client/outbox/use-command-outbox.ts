"use client";

import { useEffect, useState, useCallback } from "react";
import { getCommandOutbox, type QueuedCommand } from "./command-outbox";

export function useCommandOutbox() {
  const [commands, setCommands] = useState<QueuedCommand[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const outbox = getCommandOutbox();

  useEffect(() => {
    const unsubscribe = outbox.subscribe((updated) => {
      setCommands(updated);
    });

    const handleOnline = () => {
      setIsOnline(true);
      outbox.processOutbox();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    return () => {
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [outbox]);

  const flush = useCallback(async () => {
    return outbox.processOutbox();
  }, [outbox]);

  const retryCommand = useCallback(
    (id: string) => {
      outbox.retry(id);
      outbox.processOutbox();
    },
    [outbox]
  );

  const removeCommand = useCallback(
    (id: string) => {
      outbox.remove(id);
    },
    [outbox]
  );

  const clearSynced = useCallback(() => {
    outbox.clearSynced();
  }, [outbox]);

  const pendingCount = commands.filter(
    (c) => c.status === "QUEUED" || c.status === "IN_FLIGHT"
  ).length;

  const unknownCount = commands.filter((c) => c.status === "UNKNOWN_OUTCOME").length;
  const rejectedCount = commands.filter((c) => c.status === "REJECTED").length;

  return {
    commands,
    isOnline,
    pendingCount,
    unknownCount,
    rejectedCount,
    enqueue: outbox.enqueue.bind(outbox),
    flush,
    retryCommand,
    removeCommand,
    clearSynced
  };
}
