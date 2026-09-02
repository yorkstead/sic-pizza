import React, { useState } from "react";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoidItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  onConfirmVoid: (reason: string) => void;
}

export function VoidItemDialog({
  isOpen,
  onClose,
  itemName,
  onConfirmVoid
}: VoidItemDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const quickReasons = [
    "Guest changed mind",
    "Ordered by mistake",
    "Allergy / dietary issue",
    "Kitchen delay / 86 item",
    "Quality complaint / refire"
  ];

  function handleSubmit() {
    if (!reason.trim()) {
      setError("Please select or enter a valid void reason");
      return;
    }
    onConfirmVoid(reason.trim());
    setReason("");
    setError("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" />
            <h2 className="text-lg font-bold text-foreground">Void Item</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          You are voiding <strong className="text-foreground">{itemName}</strong>. Every void requires an auditable reason.
        </p>

        {/* Quick reasons */}
        <div className="mt-4 space-y-1.5">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Select Reason
          </span>
          <div className="flex flex-wrap gap-1.5">
            {quickReasons.map((qr) => (
              <button
                key={qr}
                type="button"
                onClick={() => {
                  setReason(qr);
                  setError("");
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  reason === qr
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {qr}
              </button>
            ))}
          </div>
        </div>

        {/* Custom text */}
        <div className="mt-4">
          <label htmlFor="custom-void-reason" className="mb-1 block text-xs font-bold text-muted-foreground">
            Custom Notes / Reason
          </label>
          <textarea
            id="custom-void-reason"
            rows={2}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            placeholder="Type reason..."
            className="w-full rounded-xl border bg-background p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>

        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleSubmit}>
            Confirm Void
          </Button>
        </div>
      </div>
    </div>
  );
}
