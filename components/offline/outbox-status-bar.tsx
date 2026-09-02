"use client";

import React, { useState } from "react";
import { useCommandOutbox } from "@/lib/client/outbox/use-command-outbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

export function OutboxStatusBar() {
  const {
    commands,
    isOnline,
    pendingCount,
    unknownCount,
    rejectedCount,
    flush,
    retryCommand,
    removeCommand,
    clearSynced
  } = useCommandOutbox();

  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const totalActive = pendingCount + unknownCount + rejectedCount;

  if (isOnline && totalActive === 0) {
    return null; // Silent when everything is normal and synced
  }

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await flush();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      {/* Top Floating Offline & Outbox Banner */}
      <div className={`sticky top-0 z-40 flex items-center justify-between px-4 py-2 text-xs font-bold transition-colors ${
        !isOnline
          ? "bg-amber-600 text-white"
          : rejectedCount > 0
            ? "bg-destructive text-destructive-foreground"
            : unknownCount > 0
              ? "bg-amber-500 text-amber-950"
              : "bg-primary/90 text-primary-foreground backdrop-blur-xs"
      }`}>
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <WifiOff className="size-4 animate-pulse" />
          ) : (
            <Wifi className="size-4" />
          )}
          <span>
            {!isOnline
              ? `Offline Mode — ${totalActive} mutation${totalActive === 1 ? "" : "s"} stored locally`
              : rejectedCount > 0
                ? `${rejectedCount} action${rejectedCount === 1 ? "" : "s"} rejected by server`
                : unknownCount > 0
                  ? `${unknownCount} action${unknownCount === 1 ? "" : "s"} awaiting server verification`
                  : `Syncing ${pendingCount} queued command${pendingCount === 1 ? "" : "s"}...`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {totalActive > 0 && (
            <Button
              variant="secondary"
              className="h-7 text-[11px] px-2.5 bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={handleSync}
              disabled={isSyncing || !isOnline}
            >
              <RefreshCw className={`size-3 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          )}

          <Button
            variant="ghost"
            className="h-7 text-[11px] px-2 hover:bg-white/20 text-white"
            onClick={() => setIsOpen(true)}
          >
            Inspect Outbox ({commands.length})
          </Button>
        </div>
      </div>

      {/* Outbox & Conflict Resolution Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <Card className="w-full max-w-lg border border-border bg-card max-h-[85vh] flex flex-col">
            <CardHeader className="pt-5 pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <h2 className="text-base font-black text-foreground flex items-center gap-2">
                  <RefreshCw className="size-4 text-primary" />
                  Durable Command Outbox
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Offline queued mutations with cryptographic idempotency keys
                </p>
              </div>
              <Button
                variant="ghost"
                className="size-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </Button>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
              {commands.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs">
                  <CheckCircle className="size-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                  All mutations are fully synchronized with the server.
                </div>
              ) : (
                commands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="p-3 rounded-lg border bg-background/50 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-foreground">{cmd.description || cmd.actionName}</span>
                        <Badge
                          className={`text-[9px] px-1 py-0 font-mono ${
                            cmd.status === "SYNCED"
                              ? "bg-emerald-500/20 text-emerald-500"
                              : cmd.status === "REJECTED"
                                ? "bg-red-500/20 text-red-500"
                                : cmd.status === "UNKNOWN_OUTCOME"
                                  ? "bg-amber-500/20 text-amber-500"
                                  : "bg-blue-500/20 text-blue-500"
                          }`}
                        >
                          {cmd.status}
                        </Badge>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Attempts: {cmd.retryCount}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      Key: {cmd.idempotencyKey.slice(0, 24)}...
                    </div>

                    {cmd.error && (
                      <div className="p-2 rounded-md bg-destructive/10 text-destructive text-[11px] font-medium flex items-start gap-1.5">
                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                        <span>{cmd.error}</span>
                      </div>
                    )}

                    <div className="flex justify-end gap-1.5 pt-1">
                      {cmd.status === "REJECTED" || cmd.status === "UNKNOWN_OUTCOME" ? (
                        <Button
                          variant="secondary"
                          className="h-6 text-[10px] px-2"
                          onClick={() => retryCommand(cmd.id)}
                        >
                          <RefreshCw className="size-2.5 mr-1" />
                          Retry
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCommand(cmd.id)}
                      >
                        <XCircle className="size-2.5 mr-1" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>

            <div className="p-3 border-t bg-muted/30 flex justify-between items-center">
              <Button
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={clearSynced}
                disabled={!commands.some((c) => c.status === "SYNCED")}
              >
                Clear Synced
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </Button>
                <Button
                  className="text-xs font-bold"
                  onClick={handleSync}
                  disabled={isSyncing || !isOnline || totalActive === 0}
                >
                  <RefreshCw className={`size-3 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                  Sync Outbox
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
