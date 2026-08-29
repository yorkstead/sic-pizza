import React, { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  CreditCard,
  Droplets,
  HelpCircle,
  PackageSearch,
  Utensils,
  Wine,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RequestCategory } from "@/lib/domain/models/request";
import { routeRequest } from "@/lib/domain/models/request";

interface CreateRequestDialogProps {
  open: boolean;
  onClose: () => void;
  tableLabel: string;
  diners?: Array<{ id: string; displayName: string }>;
  onCreateRequest: (
    category: RequestCategory,
    description: string,
    dinerId?: string
  ) => void;
}

const CATEGORIES: Array<{
  category: RequestCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    category: "SERVER_NEEDED",
    label: "Server Needed",
    icon: Bell,
    description: "Assigned server requested at table"
  },
  {
    category: "DRINK_REORDER",
    label: "Drink Reorder",
    icon: Wine,
    description: "Another round of cocktails/beverages"
  },
  {
    category: "REFILL",
    label: "Water / Refill",
    icon: Droplets,
    description: "Water or non-alcoholic refill (Runner queue)"
  },
  {
    category: "CONDIMENT",
    label: "Condiments / Sauces",
    icon: Utensils,
    description: "Hot sauce, parmesan, ranch, etc."
  },
  {
    category: "TO_GO_BOX",
    label: "To-Go Boxes",
    icon: Utensils,
    description: "Takeout containers and bags"
  },
  {
    category: "UTENSILS",
    label: "Utensils / Napkins",
    icon: Utensils,
    description: "Extra forks, knives, plates, wet wipes"
  },
  {
    category: "CHECK",
    label: "Drop Check",
    icon: CreditCard,
    description: "Guest wants bill dropped"
  },
  {
    category: "MISSING_ITEM",
    label: "Missing Item",
    icon: PackageSearch,
    description: "Course item missing (Routes to Expo)"
  },
  {
    category: "FOOD_ISSUE",
    label: "Food Quality Issue",
    icon: AlertTriangle,
    description: "Undercooked / wrong dish (Escalates to Manager)"
  },
  {
    category: "OTHER",
    label: "Other Request",
    icon: HelpCircle,
    description: "Spill cleanup, high chair, custom note"
  }
];

export function CreateRequestDialog({
  open,
  onClose,
  tableLabel,
  diners = [],
  onCreateRequest
}: CreateRequestDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<RequestCategory>("SERVER_NEEDED");
  const [description, setDescription] = useState("");
  const [selectedDinerId, setSelectedDinerId] = useState<string | undefined>(undefined);

  if (!open) return null;

  const routing = routeRequest(selectedCategory);

  function handleSubmit() {
    onCreateRequest(selectedCategory, description, selectedDinerId);
    setDescription("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase text-primary">
              Log Table Task
            </span>
            <h2 className="text-lg font-black text-foreground">{tableLabel} Request</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Category Grid */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            Request Type
          </label>
          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.category;
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => setSelectedCategory(cat.category)}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  <div
                    className={`mt-0.5 rounded-md p-1 ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs font-bold leading-tight">
                      {cat.label}
                    </span>
                    <span className="block text-[10px] text-muted-foreground line-clamp-1">
                      {cat.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Routing Preview Pill */}
        <div className="rounded-xl border bg-secondary/50 p-2.5 text-xs flex items-center justify-between">
          <div className="space-x-1.5">
            <span className="text-muted-foreground">Auto-Routed To:</span>
            <strong className="text-foreground capitalize">{routing.assignedRole}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge
              className={
                routing.priority === "URGENT"
                  ? "border-destructive bg-destructive text-destructive-foreground font-black"
                  : routing.priority === "HIGH"
                  ? "border-amber-500 bg-amber-500 text-black font-bold"
                  : ""
              }
            >
              {routing.priority} Priority
            </Badge>
            <span className="text-[10px] font-mono text-muted-foreground">
              Max {routing.maxResponseMinutes}m target
            </span>
          </div>
        </div>

        {/* Optional Diner Selection */}
        {diners.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase">
              Specific Diner (Optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDinerId(undefined)}
                className={`rounded-lg px-2.5 py-1 text-xs transition ${
                  selectedDinerId === undefined
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Whole Table
              </button>
              {diners.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDinerId(d.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    selectedDinerId === d.id
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.displayName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional Notes / Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase">
            Special Instructions / Notes
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Side of ranch, extra napkins, sparkling water..."
            className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t">
          <Button variant="secondary" className="flex-1 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1 text-xs" onClick={handleSubmit}>
            <Check className="size-4 mr-1" />
            Dispatch Request
          </Button>
        </div>
      </div>
    </div>
  );
}
