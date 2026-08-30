"use client";

import React, { useState } from "react";
import { X, ArrowRightLeft, Utensils, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TableSession } from "@/lib/domain/models/session";
import { deriveTableTransferSummary, type TableTransferSummary } from "@/lib/domain/models/handoff";

interface TransferTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  session?: TableSession;
  tableLabel: string;
  currentServerName: string;
  onConfirmTransfer: (toEmployeeId: string, reason: string) => void;
  onAssignAssistant?: (assistantEmployeeId: string) => void;
}

export function TransferTableDialog({
  isOpen,
  onClose,
  session,
  tableLabel,
  currentServerName,
  onConfirmTransfer,
  onAssignAssistant
}: TransferTableDialogProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("emp_morgan");
  const [reason, setReason] = useState("Break cover (30m)");
  const [isAssistantMode, setIsAssistantMode] = useState(false);

  if (!isOpen) return null;

  const staffRoster = [
    { id: "emp_jordan", name: "Jordan", role: "Server" },
    { id: "emp_morgan", name: "Morgan", role: "Server" },
    { id: "emp_taylor", name: "Taylor", role: "Server" },
    { id: "emp_alex", name: "Alex", role: "Bartender" },
    { id: "emp_sam_mgr", name: "Sam", role: "Floor Manager" }
  ];

  const summary: TableTransferSummary | null = session ? deriveTableTransferSummary(session) : null;

  function handleSubmit() {
    if (isAssistantMode && onAssignAssistant) {
      onAssignAssistant(selectedEmployeeId);
    } else {
      onConfirmTransfer(selectedEmployeeId, reason);
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4 sm:p-5 bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-primary/20 text-primary">
              <ArrowRightLeft className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-foreground">
                {isAssistantMode ? "Assign Secondary Assistant" : "Transfer Table Ownership"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {tableLabel} · Currently assigned to <strong className="text-foreground">{currentServerName}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-secondary/60 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setIsAssistantMode(false)}
              className={`py-1.5 rounded-lg transition ${
                !isAssistantMode
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Primary Handoff
            </button>
            <button
              type="button"
              onClick={() => setIsAssistantMode(true)}
              className={`py-1.5 rounded-lg transition ${
                isAssistantMode
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Secondary Assistant
            </button>
          </div>

          {/* Real-Time Operational Briefing */}
          {summary && (
            <div className="rounded-xl border border-border/80 bg-secondary/20 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                  <Sparkles className="size-3" />
                  Live Operational Briefing (Zero Brain Dump)
                </span>
                <Badge className="font-mono text-[10px] bg-secondary">
                  {summary.stage.toUpperCase()}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Party & Time</span>
                  <p className="font-bold text-foreground">
                    {summary.guestCount} guests · {summary.elapsedMinutes}m seated
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground uppercase">Balance & Check</span>
                  <p className="font-mono font-bold text-primary">
                    {summary.unpaidBalanceFormatted} ({summary.checkState})
                  </p>
                </div>
              </div>

              <div className="space-y-1 pt-1 border-t border-border/40 text-xs">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <Utensils className="size-3.5 text-primary shrink-0" />
                  {summary.coursingSummary} · {summary.kitchenStatus}
                </p>
                {summary.openRequestsSummary.length > 0 ? (
                  <p className="text-amber-400 font-semibold text-[11px]">
                    ⚠️ {summary.openRequestsSummary.join(" · ")}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-[11px]">No unresolved guest requests</p>
                )}
              </div>
            </div>
          )}

          {/* Select Target Staff */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isAssistantMode ? "Select Assistant" : "Transfer Ownership To"}
            </label>
            <div className="space-y-1.5">
              {staffRoster.map((staff) => (
                <button
                  key={staff.id}
                  type="button"
                  onClick={() => setSelectedEmployeeId(staff.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                    selectedEmployeeId === staff.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border/60 bg-card text-muted-foreground hover:bg-secondary/40"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground">{staff.name}</span>
                  <span className="font-mono text-xs">{staff.role}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reason Input (only for Primary Handoff) */}
          {!isAssistantMode && (
            <div className="space-y-1.5">
              <label htmlFor="transfer-reason" className="block text-xs font-bold text-muted-foreground">
                Handoff Reason
              </label>
              <select
                id="transfer-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-10 w-full rounded-xl border bg-card px-3 text-xs font-bold text-foreground focus:outline-hidden"
              >
                <option value="Break cover (30m)">Break cover (30m)</option>
                <option value="Shift change handoff">Shift change handoff</option>
                <option value="Section rebalance">Section rebalance</option>
                <option value="Manager takeover">Manager takeover</option>
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-secondary/20 flex gap-2">
          <Button variant="secondary" className="flex-1 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1 bg-primary text-primary-foreground font-bold text-xs" onClick={handleSubmit}>
            {isAssistantMode ? "Assign Assistant" : "Confirm Handoff"}
          </Button>
        </div>
      </div>
    </div>
  );
}
