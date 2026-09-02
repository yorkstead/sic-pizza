"use client";

import React, { useState, useMemo } from "react";
import {
  AlertTriangle,
  Flame,
  ChefHat,
  Users,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Sparkles,
  Ban,
  Eye,
  Store,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StageBadge } from "@/components/server/stage-badge";
import type { TableSession } from "@/lib/domain/models/session";
import {
  deriveManagerOperationsOverview,
  type ManagerOperationsOverview
} from "@/lib/domain/models/manager-ops";

interface ManagerCommandCenterProps {
  sessions: TableSession[];
  onSelectTable: (tableId: string) => void;
  onTransferTable?: (sessionId: string) => void;
  onOpenSectionHandoff: () => void;
  onOpenAuditHistory: () => void;
  onResolveRequest: (sessionId: string, requestId: string, resolution: string) => Promise<void>;
  onApproveProposal?: (sessionId: string, itemId: string) => Promise<void>;
}

export function ManagerCommandCenter({
  sessions,
  onSelectTable,
  onOpenSectionHandoff,
  onOpenAuditHistory,
  onResolveRequest,
  onApproveProposal
}: ManagerCommandCenterProps) {
  const [activeTab, setActiveTab] = useState<"attention" | "kitchen" | "floor" | "staff" | "payments">("attention");
  const [unavailableItems, setUnavailableItems] = useState<Set<string>>(new Set(["top_basil"]));
  const [is86ManagerOpen, setIs86ManagerOpen] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Derive complete live operational state
  const ops: ManagerOperationsOverview = useMemo(() => {
    return deriveManagerOperationsOverview(sessions, Array.from(unavailableItems));
  }, [sessions, unavailableItems]);

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const toggle86Item = (itemId: string, itemName: string) => {
    setUnavailableItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
        showNotification(`Restored ${itemName} to active menu`);
      } else {
        next.add(itemId);
        showNotification(`86'd ${itemName} (Unavailable across POS & Guest App)`);
      }
      return next;
    });
  };

  const ALL_MENU_ITEMS_LIST = [
    { id: "top_basil", name: "Fresh Sweet Basil", category: "Produce" },
    { id: "top_pineapple", name: "Charred Pineapple", category: "Produce" },
    { id: "top_pepperoni", name: "Cup & Char Pepperoni", category: "Meat" },
    { id: "side_hot_honey", name: "Mike's Hot Honey", category: "Sauce" },
    { id: "drink_negroni", name: "Classic Negroni", category: "Bar" },
    { id: "dessert_tiramisu", name: "House Tiramisu", category: "Dessert" },
    { id: "starter_knots", name: "Garlic Parmesan Knots", category: "Bakery" }
  ];

  return (
    <div className="space-y-6">
      {/* Top Command Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
              Manager Operations Command Center
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Live Service Floor Health
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Real-time exception monitor answering: <strong className="text-foreground">What is going wrong right now?</strong>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="default"
            className="text-xs font-bold border"
            onClick={() => setIs86ManagerOpen(!is86ManagerOpen)}
          >
            <Ban className="size-3.5 mr-1.5 text-rose-400" />
            86&apos;d Items ({unavailableItems.size})
          </Button>

          <Button
            variant="secondary"
            size="default"
            className="text-xs font-bold border"
            onClick={onOpenSectionHandoff}
          >
            <ArrowRightLeft className="size-3.5 mr-1.5 text-primary" />
            Shift Handoff
          </Button>

          <Button
            variant="secondary"
            size="default"
            className="text-xs font-bold border"
            onClick={onOpenAuditHistory}
          >
            <Sparkles className="size-3.5 mr-1.5 text-cyan-400" />
            Audit Ledger
          </Button>
        </div>
      </div>

      {/* Floating Success Alert */}
      {actionSuccessMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-400 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* High-Level Pulse Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <CardContent className="p-0 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground flex items-center gap-1">
              <Store className="size-3 text-primary" />
              Active Tables
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-foreground">{ops.totalActiveTables}</span>
              <span className="text-xs font-mono text-muted-foreground">{ops.totalSeatedGuests} guests</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`p-4 ${ops.criticalCount > 0 ? "border-rose-500/50 bg-rose-500/5" : ""}`}>
          <CardContent className="p-0 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-rose-400 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              Critical / Urgent
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-rose-400">
                {ops.criticalCount + ops.urgentCount}
              </span>
              <span className="text-xs font-mono text-muted-foreground">{ops.warningCount} warnings</span>
            </div>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent className="p-0 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-amber-400 flex items-center gap-1">
              <ChefHat className="size-3" />
              Kitchen Tickets
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-foreground">
                {ops.kitchenFlow.totalActiveTickets}
              </span>
              <span className={`text-xs font-mono font-bold ${ops.kitchenFlow.totalDelayedTickets > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                {ops.kitchenFlow.totalDelayedTickets} delayed
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent className="p-0 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 flex items-center gap-1">
              <CreditCard className="size-3" />
              Unsettled Floor
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-primary">
                {ops.totalUnsettledBalanceFormatted}
              </span>
              <span className="text-xs font-mono text-muted-foreground">across floor</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 86'd Items Quick Management Drawer */}
      {is86ManagerOpen && (
        <Card className="border-rose-500/40 bg-rose-500/5 animate-in fade-in">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="size-4 text-rose-400" />
                <h3 className="text-sm font-bold text-foreground">Item Availability & 86&apos;d Manager</h3>
              </div>
              <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 font-mono text-[10px]">
                Immediate Floor Sync
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              86&apos;d items are instantly blocked from server ordering and mobile guest customization.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {ALL_MENU_ITEMS_LIST.map((item) => {
                const is86d = unavailableItems.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-xl border p-2.5 transition ${
                      is86d ? "border-rose-500/50 bg-rose-500/10" : "border-border bg-card"
                    }`}
                  >
                    <div>
                      <strong className="text-xs text-foreground block">{item.name}</strong>
                      <span className="text-[10px] font-mono text-muted-foreground">{item.category}</span>
                    </div>

                    <Button
                      size="default"
                      variant={is86d ? "danger" : "secondary"}
                      className="text-[11px] font-bold h-7 px-2.5"
                      onClick={() => toggle86Item(item.id, item.name)}
                    >
                      {is86d ? "86'd (Restore)" : "Mark 86'd"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-border/80 gap-2 overflow-x-auto pb-1 text-xs font-mono font-bold uppercase">
        <button
          type="button"
          onClick={() => setActiveTab("attention")}
          className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition shrink-0 ${
            activeTab === "attention"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="size-3.5" />
          Needs Attention ({ops.needsAttention.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("kitchen")}
          className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition shrink-0 ${
            activeTab === "kitchen"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ChefHat className="size-3.5" />
          Kitchen Flow ({ops.kitchenFlow.stations.filter((s) => s.isBottleneck).length} Bottlenecks)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("floor")}
          className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition shrink-0 ${
            activeTab === "floor"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Store className="size-3.5" />
          Dining Room ({ops.diningRoom.tables.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("staff")}
          className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition shrink-0 ${
            activeTab === "staff"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-3.5" />
          Staff Load ({ops.staffLoad.servers.length} Servers)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition shrink-0 ${
            activeTab === "payments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CreditCard className="size-3.5" />
          Payment Exceptions ({ops.paymentExceptions.length})
        </button>
      </div>

      {/* -------------------------------------------------------------------------
          SECTION 1: NEEDS ATTENTION
         ------------------------------------------------------------------------- */}
      {activeTab === "attention" && (
        <div className="space-y-3">
          {ops.needsAttention.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-2">
              <CheckCircle2 className="size-10 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-bold text-foreground">Zero Critical Service Exceptions</h3>
              <p className="text-xs max-w-sm mx-auto">
                All tables are progressing normally, kitchen tickets are on time, and all requests are fulfilled.
              </p>
            </div>
          ) : (
            ops.needsAttention.map((item) => {
              const isCrit = item.severity === "critical";
              const isUrg = item.severity === "urgent";
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 transition space-y-3 ${
                    isCrit
                      ? "border-rose-500/60 bg-rose-500/10"
                      : isUrg
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`font-mono text-[9px] uppercase font-black ${
                            isCrit
                              ? "bg-rose-500 text-white"
                              : isUrg
                              ? "bg-amber-500 text-black"
                              : "bg-secondary text-foreground"
                          }`}
                        >
                          {item.severity}
                        </Badge>
                        <strong className="text-sm font-black text-foreground">{item.tableLabel}</strong>
                        <span className="font-mono text-xs text-muted-foreground">
                          Server: <strong className="text-foreground">{item.serverName}</strong>
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-foreground">{item.headline}</h4>
                      <p className="text-xs text-muted-foreground leading-4">{item.detail}</p>
                    </div>

                    <span className="font-mono text-xs font-bold text-muted-foreground shrink-0 flex items-center gap-1">
                      <Clock className="size-3" />
                      {item.elapsedMinutes}m
                    </span>
                  </div>

                  {/* Recommended Action & 1-Tap Interventions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs">
                    <div className="font-semibold text-primary flex items-center gap-1.5">
                      <Sparkles className="size-3.5 shrink-0" />
                      <span>Action: {item.recommendedAction}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.category === "FOOD_ISSUE" && item.referenceId && (
                        <Button
                          size="default"
                          className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 px-3"
                          onClick={async () => {
                            await onResolveRequest(
                              item.sessionId,
                              item.referenceId!,
                              "Manager tableside resolution: remake + apology comp"
                            );
                            showNotification(`Resolved food issue on ${item.tableLabel}`);
                          }}
                        >
                          <Check className="size-3.5 mr-1" />
                          Resolve & Comp
                        </Button>
                      )}

                      {item.category === "PROPOSAL_PENDING" && onApproveProposal && (
                        <Button
                          size="default"
                          className="bg-primary text-primary-foreground font-bold text-xs h-8 px-3"
                          onClick={async () => {
                            const sess = sessions.find((s) => s.id === item.sessionId);
                            const prop = sess?.items.find((i) => i.status === "proposed");
                            if (prop) {
                              await onApproveProposal(item.sessionId, prop.id);
                              showNotification(`Approved guest proposals on ${item.tableLabel}`);
                            }
                          }}
                        >
                          <Check className="size-3.5 mr-1" />
                          Approve Proposals
                        </Button>
                      )}

                      <Button
                        size="default"
                        variant="secondary"
                        className="text-xs font-bold h-8"
                        onClick={() => onSelectTable(item.tableId)}
                      >
                        <Eye className="size-3.5 mr-1" />
                        Open Table
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------------
          SECTION 2: KITCHEN FLOW
         ------------------------------------------------------------------------- */}
      {activeTab === "kitchen" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {ops.kitchenFlow.stations.map((st) => (
              <Card
                key={st.stationId}
                className={`p-4 ${
                  st.isBottleneck
                    ? "border-rose-500/60 bg-rose-500/10"
                    : st.delayedCount > 0
                    ? "border-amber-500/50 bg-amber-500/5"
                    : ""
                }`}
              >
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                  <strong className="text-xs font-black text-foreground">{st.stationName}</strong>
                  {st.isBottleneck ? (
                    <Badge className="bg-rose-500 text-white font-mono text-[9px]">Bottleneck</Badge>
                  ) : (
                    <Badge className="bg-secondary font-mono text-[9px]">Normal</Badge>
                  )}
                </CardHeader>
                <CardContent className="p-0 space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-1 text-center font-mono py-1.5 bg-secondary/30 rounded-lg">
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Queued</span>
                      <strong className="text-foreground">{st.queuedCount}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">In Prep</span>
                      <strong className="text-foreground">{st.inPrepCount}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Ready</span>
                      <strong className="text-emerald-400">{st.readyCount}</strong>
                    </div>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Oldest Active Ticket</span>
                    <span className={`font-mono font-bold ${st.oldestTicketMinutes >= 18 ? "text-rose-400" : "text-foreground"}`}>
                      {st.oldestTicketMinutes}m
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Delayed Tickets Detail Feed */}
          {ops.kitchenFlow.delayedTicketsList.length > 0 && (
            <Card className="border-rose-500/50 bg-rose-500/5">
              <CardHeader className="p-4 pb-2">
                <h3 className="text-xs font-bold text-rose-400 uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Flame className="size-4" />
                  Delayed Line Tickets ({ops.kitchenFlow.delayedTicketsList.length})
                </h3>
              </CardHeader>
              <CardContent className="p-4 pt-1 divide-y divide-border/60">
                {ops.kitchenFlow.delayedTicketsList.map((dt) => (
                  <div key={dt.ticketId} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-foreground">{dt.tableLabel}</strong>
                        <Badge className="font-mono text-[9px] uppercase bg-secondary">{dt.stationId}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{dt.itemsSummary}</p>
                    </div>
                    <Badge className="bg-rose-500 text-white font-mono text-xs font-bold">
                      {dt.elapsedMinutes}m in prep
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------------------
          SECTION 3: DINING ROOM OVERVIEW
         ------------------------------------------------------------------------- */}
      {activeTab === "floor" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {ops.diningRoom.tables.map((tbl) => (
              <Card
                key={tbl.sessionId}
                onClick={() => onSelectTable(tbl.tableId)}
                className={`p-3.5 cursor-pointer hover:border-primary transition ${
                  tbl.hasAlert ? "border-rose-500/50 bg-rose-500/10" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <strong className="text-sm font-black text-foreground">{tbl.tableLabel}</strong>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {tbl.guestCount} guests · {tbl.elapsedMinutes}m
                    </p>
                  </div>
                  <StageBadge stage={tbl.stage} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs border-t pt-2">
                  <span className="text-[11px] font-bold text-muted-foreground">{tbl.serverName}</span>
                  <span className="font-mono text-xs font-bold text-foreground">{tbl.unpaidBalanceFormatted}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          SECTION 4: STAFF LOAD BALANCING
         ------------------------------------------------------------------------- */}
      {activeTab === "staff" && (
        <div className="space-y-4">
          {ops.staffLoad.hasLoadImbalance && ops.staffLoad.imbalanceRecommendation && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs font-bold text-amber-300 flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-amber-400" />
              <span>{ops.staffLoad.imbalanceRecommendation}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {ops.staffLoad.servers.map((srv) => (
              <Card key={srv.employeeId} className={`p-4 ${srv.isOverloaded ? "border-amber-500/50" : ""}`}>
                <CardHeader className="p-0 pb-2 flex flex-row items-center justify-between">
                  <div>
                    <strong className="text-sm font-black text-foreground">{srv.employeeName}</strong>
                    <span className="text-[10px] text-muted-foreground block font-mono">
                      Tables: {srv.tableLabels.join(", ") || "None"}
                    </span>
                  </div>
                  {srv.isOverloaded && (
                    <Badge className="bg-amber-500 text-black font-mono text-[9px]">Overloaded</Badge>
                  )}
                </CardHeader>
                <CardContent className="p-0 space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-1 text-center font-mono py-1.5 bg-secondary/30 rounded-lg">
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Tables</span>
                      <strong className="text-foreground">{srv.tableCount}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Guests</span>
                      <strong className="text-foreground">{srv.guestCount}</strong>
                    </div>
                    <div>
                      <span className="text-[9px] text-muted-foreground block">Requests</span>
                      <strong className={srv.openRequestsCount > 0 ? "text-amber-400" : "text-foreground"}>
                        {srv.openRequestsCount}
                      </strong>
                    </div>
                  </div>

                  <Button
                    size="default"
                    variant="secondary"
                    className="w-full text-xs font-bold h-7"
                    onClick={onOpenSectionHandoff}
                  >
                    <ArrowRightLeft className="size-3.5 mr-1" />
                    Rebalance Section
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------
          SECTION 5: PAYMENT EXCEPTIONS
         ------------------------------------------------------------------------- */}
      {activeTab === "payments" && (
        <div className="space-y-3">
          {ops.paymentExceptions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              No outstanding payment exceptions on the floor.
            </div>
          ) : (
            ops.paymentExceptions.map((pe) => (
              <Card key={pe.sessionId} className="p-4 border-amber-500/50 bg-amber-500/5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-black text-foreground">{pe.tableLabel}</strong>
                      <span className="font-mono text-xs text-muted-foreground">Server: {pe.serverName}</span>
                    </div>
                    <p className="text-xs text-amber-400 font-bold mt-0.5">{pe.reason}</p>
                  </div>
                  <span className="font-mono text-base font-black text-primary">{pe.unpaidBalanceFormatted}</span>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
