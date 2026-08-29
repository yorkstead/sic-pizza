import React, { useState } from "react";
import { Users, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Diner } from "@/lib/domain/models/session";
import type { SplitMode } from "@/lib/domain/models/order";

interface SplitItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  itemTotalCents: number;
  diners: readonly Diner[];
  currentSplitMode: SplitMode;
  currentAssignedDinerIds: string[];
  onConfirmSplit: (ownership: {
    splitMode: SplitMode;
    assignedDinerIds: string[];
    customShares?: Record<string, number>;
  }) => void;
}

export function SplitItemDialog({
  isOpen,
  onClose,
  itemName,
  diners,
  currentSplitMode,
  currentAssignedDinerIds,
  onConfirmSplit
}: SplitItemDialogProps) {
  const [mode, setMode] = useState<SplitMode>(currentSplitMode || "single");
  const [selectedDinerIds, setSelectedDinerIds] = useState<string[]>(
    currentAssignedDinerIds.length > 0 ? currentAssignedDinerIds : [diners[0]?.id || ""]
  );

  if (!isOpen) return null;

  function toggleDiner(dinerId: string) {
    if (mode === "single") {
      setSelectedDinerIds([dinerId]);
    } else {
      setSelectedDinerIds((prev) =>
        prev.includes(dinerId)
          ? prev.length > 1
            ? prev.filter((id) => id !== dinerId)
            : prev
          : [...prev, dinerId]
      );
    }
  }

  function handleSave() {
    if (mode === "whole_table") {
      onConfirmSplit({
        splitMode: "whole_table",
        assignedDinerIds: diners.map((d) => d.id)
      });
    } else if (mode === "shared_diners") {
      onConfirmSplit({
        splitMode: "shared_diners",
        assignedDinerIds: selectedDinerIds
      });
    } else {
      onConfirmSplit({
        splitMode: "single",
        assignedDinerIds: [selectedDinerIds[0] || diners[0]?.id || ""]
      });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Item Ownership & Split</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Configure how <strong className="text-foreground">{itemName}</strong> is allocated across diners.
        </p>

        {/* Mode Selector */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl border bg-secondary/30 p-1 font-mono text-xs font-bold uppercase">
          <button
            type="button"
            onClick={() => {
              setMode("single");
              if (selectedDinerIds.length > 1) setSelectedDinerIds([selectedDinerIds[0]]);
            }}
            className={`rounded-lg py-2 transition ${
              mode === "single" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
            }`}
          >
            Single Diner
          </button>
          <button
            type="button"
            onClick={() => setMode("shared_diners")}
            className={`rounded-lg py-2 transition ${
              mode === "shared_diners" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
            }`}
          >
            Split Diners
          </button>
          <button
            type="button"
            onClick={() => setMode("whole_table")}
            className={`rounded-lg py-2 transition ${
              mode === "whole_table" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
            }`}
          >
            Whole Table
          </button>
        </div>

        {/* Diner Checklist */}
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {mode === "whole_table"
              ? "All table guests will share this item equally"
              : mode === "shared_diners"
              ? "Select guests sharing this item"
              : "Select item owner"}
          </label>

          <div className="space-y-1.5">
            {diners.map((d) => {
              const isSelected =
                mode === "whole_table" || selectedDinerIds.includes(d.id);

              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={mode === "whole_table"}
                  onClick={() => toggleDiner(d.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground font-semibold"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isSelected && <Check className="size-4 text-primary" />}
                    <span className="text-sm text-foreground">{d.displayName}</span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    Seat {d.seatNumber || "-"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            Save Ownership
          </Button>
        </div>
      </div>
    </div>
  );
}
