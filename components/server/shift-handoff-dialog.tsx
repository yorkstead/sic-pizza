"use client";

import React, { useState, useMemo } from "react";
import {
  Utensils,
  CreditCard,
  ArrowRightLeft,
  AlertCircle,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TableSession } from "@/lib/domain/models/session";
import { deriveSectionHandoffReport } from "@/lib/domain/models/handoff";

interface ShiftHandoffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeServerId: string;
  activeServerName: string;
  allSessions: TableSession[];
  availableEmployees: Array<{ id: string; name: string; role: string }>;
  onTransferTables: (sessionIds: string[], toEmployeeId: string, reason: string) => Promise<void>;
}

export function ShiftHandoffDialog({
  isOpen,
  onClose,
  activeServerId,
  activeServerName,
  allSessions,
  availableEmployees,
  onTransferTables
}: ShiftHandoffDialogProps) {
  const [explicitSelection, setExplicitSelection] = useState<Set<string> | null>(null);
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>(
    availableEmployees.find((e) => e.id !== activeServerId)?.id || ""
  );
  const [reason, setReason] = useState<string>("Break cover (30m)");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate live section handoff report
  const report = useMemo(() => {
    return deriveSectionHandoffReport(allSessions, activeServerId);
  }, [allSessions, activeServerId]);

  const selectedSessionIds = useMemo(() => {
    if (explicitSelection !== null) return explicitSelection;
    return new Set(report.tables.map((t) => t.sessionId));
  }, [explicitSelection, report.tables]);

  if (!isOpen) return null;

  const toggleSelectTable = (sessionId: string) => {
    const next = new Set(selectedSessionIds);
    if (next.has(sessionId)) {
      next.delete(sessionId);
    } else {
      next.add(sessionId);
    }
    setExplicitSelection(next);
  };

  const handleSelectAll = () => {
    if (selectedSessionIds.size === report.tables.length) {
      setExplicitSelection(new Set());
    } else {
      setExplicitSelection(new Set(report.tables.map((t) => t.sessionId)));
    }
  };

  const handleExecuteTransfer = async () => {
    if (selectedSessionIds.size === 0 || !targetEmployeeId) return;
    setIsSubmitting(true);
    try {
      await onTransferTables(Array.from(selectedSessionIds), targetEmployeeId, reason);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const targetEmployee = availableEmployees.find((e) => e.id === targetEmployeeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-xs animate-in fade-in">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border bg-card overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b p-4 sm:p-5 bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/20 text-primary">
              <ArrowRightLeft className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-foreground">
                  Instant Shift & Section Handoff
                </h2>
                <Badge className="bg-primary/20 text-primary border-primary/40 font-mono text-[10px]">
                  Zero Brain Dump
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Transfer live operational context from <strong className="text-foreground">{activeServerName}</strong> directly to receiving staff.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>

        {/* Section Snapshot Bar */}
        <div className="grid grid-cols-4 border-b bg-secondary/15 p-3 text-center text-xs">
          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Active Tables</span>
            <p className="font-mono text-sm font-black text-foreground">{report.totalTables}</p>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Total Guests</span>
            <p className="font-mono text-sm font-black text-foreground">{report.totalGuests}</p>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Open Requests</span>
            <p className="font-mono text-sm font-black text-amber-400">{report.totalOpenRequests}</p>
          </div>
          <div>
            <span className="text-[10px] font-mono text-muted-foreground uppercase">Unpaid Section</span>
            <p className="font-mono text-sm font-black text-primary">{report.totalUnpaidBalanceFormatted}</p>
          </div>
        </div>

        {/* Content Body: Live Table Context Summaries */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold uppercase text-muted-foreground">
              Select Tables to Transfer ({selectedSessionIds.size} of {report.tables.length} selected)
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-bold text-primary hover:underline"
            >
              {selectedSessionIds.size === report.tables.length ? "Deselect All" : "Select All Tables"}
            </button>
          </div>

          {report.tables.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No active tables currently assigned to {activeServerName}.
            </div>
          ) : (
            <div className="space-y-3">
              {report.tables.map((table) => {
                const isSelected = selectedSessionIds.has(table.sessionId);
                return (
                  <div
                    key={table.sessionId}
                    onClick={() => toggleSelectTable(table.sessionId)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border/60 bg-card hover:bg-secondary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by container
                          className="size-4 rounded accent-primary cursor-pointer"
                        />
                        <div>
                          <strong className="text-sm font-black text-foreground">{table.tableLabel}</strong>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {table.guestCount} guests · {table.elapsedMinutes}m seated
                          </span>
                        </div>
                      </div>

                      <Badge className="font-mono text-[10px] uppercase bg-secondary">
                        {table.stage}
                      </Badge>
                    </div>

                    {/* Operational Summary Grid */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-secondary/40 p-2 space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground flex items-center gap-1">
                          <Utensils className="size-3 text-primary" />
                          Coursing & Kitchen
                        </span>
                        <p className="font-bold text-foreground text-[11px]">{table.coursingSummary}</p>
                        <p className="text-[10px] text-muted-foreground">{table.kitchenStatus}</p>
                      </div>

                      <div className="rounded-lg bg-secondary/40 p-2 space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground flex items-center gap-1">
                          <CreditCard className="size-3 text-emerald-400" />
                          Check & Requests
                        </span>
                        <p className="font-bold text-foreground text-[11px]">
                          {table.checkState}
                        </p>
                        <p className="text-[10px] text-amber-400">
                          {table.openRequestsSummary.length > 0
                            ? table.openRequestsSummary.join(" · ")
                            : "No open requests"}
                        </p>
                      </div>
                    </div>

                    {/* Attention Alerts if any */}
                    {table.attentionAlerts.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-rose-400 bg-rose-500/10 rounded-lg px-2.5 py-1">
                        <AlertCircle className="size-3.5 shrink-0" />
                        <span>{table.attentionAlerts.join(" · ")}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transfer Destination & Action Footer */}
        <footer className="border-t p-4 bg-secondary/20 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                Receiving Staff Member:
              </label>
              <select
                value={targetEmployeeId}
                onChange={(e) => setTargetEmployeeId(e.target.value)}
                className="w-full h-9 rounded-lg border bg-card px-3 text-xs font-bold text-foreground focus:outline-hidden"
              >
                {availableEmployees
                  .filter((e) => e.id !== activeServerId)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1">
                Handoff Reason:
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-9 rounded-lg border bg-card px-3 text-xs font-bold text-foreground focus:outline-hidden"
              >
                <option value="Break cover (30m)">Break cover (30m)</option>
                <option value="Shift end transition">Shift end transition</option>
                <option value="Section rebalance">Section rebalance</option>
                <option value="Manager takeover">Manager takeover</option>
                <option value="Closing duties">Closing duties</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              {targetEmployee?.name || "Target staff"} will inherit all requests & attention alerts.
            </span>

            <div className="flex gap-2">
              <Button variant="ghost" size="default" onClick={onClose} className="text-xs">
                Cancel
              </Button>
              <Button
                size="default"
                disabled={selectedSessionIds.size === 0 || !targetEmployeeId || isSubmitting}
                onClick={handleExecuteTransfer}
                className="bg-primary text-primary-foreground font-bold text-xs"
              >
                <ArrowRightLeft className="size-4 mr-1.5" />
                Handoff {selectedSessionIds.size} Table(s)
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
