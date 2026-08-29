import React from "react";
import { AlertCircle, Clock, CreditCard, Sparkles, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AttentionUrgency } from "@/lib/domain/models/session";

interface AttentionBadgeProps {
  urgency: AttentionUrgency;
  reasons?: string[];
  className?: string;
  compact?: boolean;
}

export function AttentionBadge({ urgency, reasons = [], className, compact = false }: AttentionBadgeProps) {
  if (urgency === "normal") return null;

  switch (urgency) {
    case "urgent_guest_request":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-xs font-bold text-red-300 animate-pulse",
            className
          )}
          title={reasons.join(", ")}
        >
          <AlertCircle className="size-3 text-red-400" />
          <span>{compact ? "Request" : (reasons[0] || "Guest Request")}</span>
        </span>
      );

    case "kitchen_delayed":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-300",
            className
          )}
          title={reasons.join(", ")}
        >
          <Clock className="size-3 text-orange-400" />
          <span>{compact ? ">25m" : "Kitchen >25m"}</span>
        </span>
      );

    case "check_requested":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-yellow-500/40 bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-300",
            className
          )}
          title={reasons.join(", ")}
        >
          <CreditCard className="size-3 text-yellow-400" />
          <span>{compact ? "Check" : "Check Req"}</span>
        </span>
      );

    case "ready_to_clear":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300",
            className
          )}
          title={reasons.join(", ")}
        >
          <Sparkles className="size-3 text-emerald-400" />
          <span>{compact ? "Clear" : "Ready to Clear"}</span>
        </span>
      );

    case "idle_attention_needed":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300",
            className
          )}
          title={reasons.join(", ")}
        >
          <AlertTriangle className="size-3 text-amber-400" />
          <span>{compact ? "Idle" : "Needs Attention"}</span>
        </span>
      );

    default:
      return null;
  }
}
