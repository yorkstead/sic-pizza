"use client";

import React, { useState, useEffect } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Layers,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ClientMutationQueue,
  type ConnectivityState,
  type MutationEnvelope
} from "@/lib/domain/models/idempotency";

interface ConnectivityStatusBarProps {
  queue: ClientMutationQueue;
  onFlush?: () => Promise<void>;
}

export function ConnectivityStatusBar({ queue, onFlush }: ConnectivityStatusBarProps) {
  const [state, setState] = useState<ConnectivityState>(queue.getConnectivity());
  const [mutations, setMutations] = useState<readonly MutationEnvelope[]>(queue.getQueue());
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);

  useEffect(() => {
    const unsubscribe = queue.subscribe((muts, connState) => {
      setMutations(muts);
      setState(connState);
    });
    return () => unsubscribe();
  }, [queue]);

  const pendingCount = mutations.filter((m) => m.status === "pending" || m.status === "retrying").length;
  const failedCount = mutations.filter((m) => m.status === "failed").length;

  const handleToggleOnline = () => {
    if (state === "online") {
      queue.setConnectivity("offline");
    } else {
      queue.setConnectivity("online");
      if (onFlush && pendingCount > 0) {
        handleFlush();
      }
    }
  };

  const handleFlush = async () => {
    if (!onFlush || isFlushing) return;
    setIsFlushing(true);
    try {
      await onFlush();
    } finally {
      setIsFlushing(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card text-xs shadow-xs">
      <div className="flex flex-wrap items-center justify-between p-2 sm:px-3">
        {/* Left: Connectivity Pill */}
        <div className="flex items-center gap-2">
          {state === "online" && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-emerald-400">
              <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
              <Wifi className="size-3.5" />
              <span>Online · Synced</span>
            </div>
          )}

          {state === "offline" && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-400">
              <span className="flex size-2 rounded-full bg-amber-400" />
              <WifiOff className="size-3.5" />
              <span>Offline Mode ({pendingCount} queued)</span>
            </div>
          )}

          {state === "syncing" && (
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-cyan-400">
              <RefreshCw className="size-3.5 animate-spin" />
              <span>Syncing with Server...</span>
            </div>
          )}

          {failedCount > 0 && (
            <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/40 text-[10px] font-mono">
              {failedCount} failed
            </Badge>
          )}
        </div>

        {/* Right: Actions & Simulator */}
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Button
              variant="secondary"
              className="h-7 px-2.5 text-[11px] font-bold border border-primary/40 text-primary"
              onClick={handleFlush}
              disabled={state === "offline" || isFlushing}
            >
              <RefreshCw className={`size-3 mr-1 ${isFlushing ? "animate-spin" : ""}`} />
              Sync ({pendingCount})
            </Button>
          )}

          {mutations.length > 0 && (
            <Button
              variant="ghost"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <Layers className="size-3 mr-1" />
              Queue ({mutations.length})
              {isExpanded ? <ChevronUp className="size-3 ml-1" /> : <ChevronDown className="size-3 ml-1" />}
            </Button>
          )}

          {/* Wi-Fi Simulator Toggle */}
          <button
            type="button"
            onClick={handleToggleOnline}
            className="rounded-lg border bg-secondary/40 px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            title="Toggle simulated Wi-Fi drop to test offline idempotency queue"
          >
            {state === "online" ? "Simulate Disconnect" : "Simulate Reconnect"}
          </button>
        </div>
      </div>

      {/* Expanded Mutation Queue Drawer */}
      {isExpanded && mutations.length > 0 && (
        <div className="border-t p-3 bg-secondary/10 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-muted-foreground">
            <span>Client Mutation Stream (Idempotency Envelopes)</span>
            <button
              type="button"
              onClick={() => queue.clearSynced()}
              className="text-primary hover:underline"
            >
              Clear Synced
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {mutations.map((m) => (
              <Card key={m.idempotencyKey} className="p-2 flex items-center justify-between font-mono text-[10px]">
                <div>
                  <div className="flex items-center gap-1.5">
                    <strong className="text-foreground">{m.mutationType}</strong>
                    <span className="text-muted-foreground">({m.sessionId.substring(0, 8)})</span>
                  </div>
                  <span className="text-muted-foreground block truncate max-w-xs">
                    Key: {m.idempotencyKey}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {m.retryCount > 0 && (
                    <span className="text-amber-400">Retry #{m.retryCount}</span>
                  )}

                  <Badge
                    className={`text-[9px] uppercase ${
                      m.status === "synced"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : m.status === "pending"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        : m.status === "failed"
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                        : "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                    }`}
                  >
                    {m.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
