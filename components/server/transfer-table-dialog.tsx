import React, { useState } from "react";
import { Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TransferTableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tableLabel: string;
  currentServerName: string;
  onConfirmTransfer: (toEmployeeId: string, reason: string) => void;
}

export function TransferTableDialog({
  isOpen,
  onClose,
  tableLabel,
  currentServerName,
  onConfirmTransfer
}: TransferTableDialogProps) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("emp_morgan");
  const [reason, setReason] = useState("Shift change handoff");

  if (!isOpen) return null;

  const staffRoster = [
    { id: "emp_jordan", name: "Jordan · Server", role: "Server" },
    { id: "emp_morgan", name: "Morgan · Server", role: "Server" },
    { id: "emp_taylor", name: "Taylor · Server", role: "Server" },
    { id: "emp_alex", name: "Alex · Bartender", role: "Bartender" },
    { id: "emp_sam_mgr", name: "Sam · Floor Manager", role: "Manager" }
  ];

  function handleSubmit() {
    onConfirmTransfer(selectedEmployeeId, reason);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Transfer Table</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Reassign <strong className="text-foreground">{tableLabel}</strong> from <span className="font-semibold text-foreground">{currentServerName}</span>.
        </p>

        {/* Server Select */}
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Transfer To
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
                    : "border-border bg-card text-muted-foreground hover:bg-secondary"
                }`}
              >
                <span className="text-sm font-bold text-foreground">{staff.name}</span>
                <span className="font-mono text-xs">{staff.role}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div className="mt-4">
          <label htmlFor="transfer-reason" className="mb-1 block text-xs font-bold text-muted-foreground">
            Transfer Reason
          </label>
          <input
            id="transfer-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit}>
            Confirm Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
