import React from "react";
import { cn } from "@/lib/utils";
import type { DiningStage } from "@/lib/domain/models/session";

interface StageBadgeProps {
  stage: DiningStage;
  className?: string;
  size?: "sm" | "md";
}

const stageConfigs: Record<
  DiningStage,
  { label: string; bg: string; text: string; border: string }
> = {
  SEATED: {
    label: "Seated",
    bg: "bg-blue-500/15",
    text: "text-blue-400",
    border: "border-blue-500/30"
  },
  DRINKS: {
    label: "Drinks",
    bg: "bg-cyan-500/15",
    text: "text-cyan-400",
    border: "border-cyan-500/30"
  },
  ORDERING: {
    label: "Ordering",
    bg: "bg-purple-500/15",
    text: "text-purple-400",
    border: "border-purple-500/30"
  },
  APPETIZERS: {
    label: "Appetizers",
    bg: "bg-amber-500/15",
    text: "text-amber-400",
    border: "border-amber-500/30"
  },
  ENTREES: {
    label: "Entrees",
    bg: "bg-rose-500/15",
    text: "text-rose-400",
    border: "border-rose-500/30"
  },
  DESSERT: {
    label: "Dessert",
    bg: "bg-fuchsia-500/15",
    text: "text-fuchsia-400",
    border: "border-fuchsia-500/30"
  },
  CHECK_REQUESTED: {
    label: "Check Req",
    bg: "bg-yellow-500/20",
    text: "text-yellow-300",
    border: "border-yellow-500/40"
  },
  PAYING: {
    label: "Paying",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30"
  },
  CLOSED: {
    label: "Closed",
    bg: "bg-zinc-800",
    text: "text-zinc-400",
    border: "border-zinc-700"
  }
};

export function StageBadge({ stage, className, size = "md" }: StageBadgeProps) {
  const config = stageConfigs[stage] || stageConfigs.SEATED;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-mono font-bold uppercase tracking-wider",
        config.bg,
        config.text,
        config.border,
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]",
        className
      )}
    >
      {config.label}
    </span>
  );
}
