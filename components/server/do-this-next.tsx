import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  Flame,
  Sliders,
  Sparkles,
  Users,
  Utensils,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { AttentionItem, AttentionConfig, AttentionSeverity } from "@/lib/domain/models/attention";

interface DoThisNextProps {
  items: AttentionItem[];
  currentServerId: string;
  config: AttentionConfig;
  onUpdateConfig?: (config: Partial<AttentionConfig>) => void;
  onDismissItem?: (itemId: string) => void;
  onSelectTable: (tableId: string, initialTab?: string) => void;
  onExecuteAction?: (item: AttentionItem) => void;
}

const SEVERITY_STYLES: Record<
  AttentionSeverity,
  { badge: string; border: string; bg: string; icon: React.ComponentType<{ className?: string }> }
> = {
  URGENT: {
    badge: "bg-red-500 text-white font-black animate-pulse",
    border: "border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]",
    bg: "bg-red-500/10",
    icon: Flame
  },
  HIGH: {
    badge: "bg-orange-500 text-white font-bold",
    border: "border-orange-500/80 shadow-[0_0_15px_rgba(249,115,22,0.15)]",
    bg: "bg-orange-500/10",
    icon: AlertTriangle
  },
  MEDIUM: {
    badge: "bg-amber-500 text-black font-bold",
    border: "border-amber-500/50",
    bg: "bg-amber-500/5",
    icon: AlertCircle
  },
  LOW: {
    badge: "bg-blue-500 text-white font-medium",
    border: "border-blue-500/40",
    bg: "bg-blue-500/5",
    icon: Clock
  },
  INFO: {
    badge: "bg-secondary text-secondary-foreground font-medium",
    border: "border-border",
    bg: "bg-card",
    icon: Sparkles
  }
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  orders: Utensils,
  tasks: Bell,
  checks: CreditCard,
  kitchen: ChefHat,
  floor: Users,
  bill: CreditCard,
  diner: Users
};

export function DoThisNext({
  items,
  currentServerId,
  config,
  onUpdateConfig,
  onDismissItem,
  onSelectTable,
  onExecuteAction
}: DoThisNextProps) {
  const [filterScope, setFilterScope] = useState<"my_tables" | "floor">("my_tables");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Local config form state
  const [formConfig, setFormConfig] = useState<AttentionConfig>(config);

  const filteredItems = items.filter((item) => {
    if (filterScope === "my_tables" && item.assignedServerId && item.assignedServerId !== currentServerId) {
      return false;
    }
    if (severityFilter !== "all" && item.severity !== severityFilter) {
      return false;
    }
    return true;
  });

  const urgentCount = items.filter((i) => i.severity === "URGENT" || i.severity === "HIGH").length;
  const myItemsCount = items.filter((i) => !i.assignedServerId || i.assignedServerId === currentServerId).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
              Operational Attention Engine
            </span>
            {urgentCount > 0 && (
              <Badge className="bg-red-500 text-white font-bold text-[10px] px-2 py-0 animate-pulse">
                {urgentCount} High Urgency
              </Badge>
            )}
          </div>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl text-foreground">
            DO THIS NEXT
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritized real-time operational directives derived from dining room, kitchen, and guest states.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="default"
            className="flex items-center gap-1.5 text-xs font-semibold"
            onClick={() => {
              setFormConfig(config);
              setShowConfigModal(true);
            }}
          >
            <Sliders className="size-3.5" />
            Config Thresholds
          </Button>
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5 border-l-4 border-l-primary">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Directives
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{items.length}</span>
            <Sparkles className="size-4 text-primary" />
          </div>
        </Card>

        <Card className={`p-3.5 border-l-4 ${urgentCount > 0 ? "border-l-red-500 bg-red-500/10" : "border-l-border"}`}>
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Urgent / High
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-2xl font-black ${urgentCount > 0 ? "text-red-400" : "text-foreground"}`}>
              {urgentCount}
            </span>
            <Flame className={`size-4 ${urgentCount > 0 ? "text-red-400" : "text-muted-foreground"}`} />
          </div>
        </Card>

        <Card className="p-3.5 border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            My Table Tasks
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{myItemsCount}</span>
            <Users className="size-4 text-amber-500" />
          </div>
        </Card>

        <Card className="p-3.5 border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Rules Active
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">11 Rules</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            size="default"
            variant={filterScope === "my_tables" ? "secondary" : "ghost"}
            className="h-8 text-xs font-bold"
            onClick={() => setFilterScope("my_tables")}
          >
            My Station ({myItemsCount})
          </Button>
          <Button
            size="default"
            variant={filterScope === "floor" ? "secondary" : "ghost"}
            className="h-8 text-xs font-bold"
            onClick={() => setFilterScope("floor")}
          >
            All Floor Directives ({items.length})
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {["all", "URGENT", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <Button
              key={sev}
              size="default"
              variant={severityFilter === sev ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-[11px] font-semibold uppercase"
              onClick={() => setSeverityFilter(sev)}
            >
              {sev}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Directives List */}
      {filteredItems.length === 0 ? (
        <Card className="border-dashed py-14 text-center">
          <CardContent className="space-y-3">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="size-6" />
            </div>
            <h2 className="text-lg font-black text-foreground">All Clear on the Floor!</h2>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No operational bottlenecks detected. All tables are paced normally, requests are resolved, and tickets are within target prep times.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.INFO;
            const ActionIcon = ACTION_ICONS[item.actionRoute] || ArrowRight;
            const isAssignedToMe = !item.assignedServerId || item.assignedServerId === currentServerId;

            return (
              <Card
                key={item.id}
                className={`overflow-hidden border-2 transition-all hover:scale-[1.005] ${style.border} ${style.bg}`}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Directive Details */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="font-mono font-black text-xs px-2 py-0.5 bg-foreground text-background">
                          {item.tableLabel}
                        </Badge>
                        <Badge className={`text-[10px] px-2 py-0.5 uppercase tracking-wide ${style.badge}`}>
                          {item.severity}
                        </Badge>
                        <span className="flex items-center gap-1 font-mono text-xs font-semibold text-muted-foreground">
                          <Clock className="size-3" />
                          {item.ageMinutes}m waiting
                        </span>
                        {item.dinerName && (
                          <Badge className="border border-border bg-secondary/50 text-foreground text-[10px]">
                            {item.dinerName}
                          </Badge>
                        )}
                        {!isAssignedToMe && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            (Server: {item.assignedServerId})
                          </span>
                        )}
                      </div>

                      <h2 className="text-base font-black text-foreground leading-snug">
                        {item.reason}
                      </h2>

                      {item.details && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {item.details}
                        </p>
                      )}
                    </div>

                    {/* Action Block */}
                    <div className="flex flex-row items-center gap-2 pt-2 sm:flex-col sm:items-end sm:pt-0 shrink-0">
                      <Button
                        size="default"
                        className={`h-10 px-4 font-black shadow-md flex items-center gap-2 text-xs ${
                          item.severity === "URGENT"
                            ? "bg-red-600 hover:bg-red-500 text-white"
                            : item.severity === "HIGH"
                            ? "bg-orange-600 hover:bg-orange-500 text-white"
                            : ""
                        }`}
                        onClick={() => {
                          if (onExecuteAction) {
                            onExecuteAction(item);
                          } else {
                            onSelectTable(item.tableId, item.actionRoute);
                          }
                        }}
                      >
                        <ActionIcon className="size-4" />
                        <span>{item.recommendedAction}</span>
                      </Button>

                      {item.canDismiss && onDismissItem && (
                        <Button
                          variant="ghost"
                          size="default"
                          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => onDismissItem(item.id)}
                        >
                          <X className="size-3 mr-1" />
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Config Drawer / Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg overflow-hidden border-2 border-primary/40 shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4 bg-muted/40">
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-primary" />
                <h3 className="font-black text-base text-foreground">
                  Location Attention Thresholds
                </h3>
              </div>
              <Button
                variant="ghost"
                size="default"
                className="size-8 p-0"
                onClick={() => setShowConfigModal(false)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <CardContent className="space-y-4 p-5 text-xs max-h-[70vh] overflow-y-auto">
              <p className="text-muted-foreground">
                Tune the operational sensitivity of deterministic alert rules for this location.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Seated Without Drinks (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formConfig.seatedWithoutDrinksMinutes}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        seatedWithoutDrinksMinutes: parseInt(e.target.value) || 1
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Directs server to take beverage order if table has been seated for this long.
                  </span>
                </div>

                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Kitchen Ticket Late Threshold (Minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={formConfig.kitchenTicketLateThresholdMinutes}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        kitchenTicketLateThresholdMinutes: parseInt(e.target.value) || 5
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Flags tickets in prep that exceed standard kitchen turnaround time.
                  </span>
                </div>

                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Guest Proposal Review Wait (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formConfig.guestProposalWaitMinutes}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        guestProposalWaitMinutes: parseInt(e.target.value) || 1
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Check Requested Wait (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={formConfig.checkRequestedWaitMinutes}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        checkRequestedWaitMinutes: parseInt(e.target.value) || 1
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Ready Items Waiting for Delivery (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formConfig.readyItemsWaitingMinutes}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        readyItemsWaitingMinutes: parseInt(e.target.value) || 1
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="font-bold text-foreground block mb-1">
                    Course Pacing Gap (Minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={formConfig.coursePacingGapMinutes}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        coursePacingGapMinutes: parseInt(e.target.value) || 5
                      })
                    }
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-3 border-t">
                <Button
                  variant="secondary"
                  size="default"
                  onClick={() => setShowConfigModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="default"
                  onClick={() => {
                    if (onUpdateConfig) {
                      onUpdateConfig(formConfig);
                    }
                    setShowConfigModal(false);
                  }}
                >
                  Save Thresholds
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
