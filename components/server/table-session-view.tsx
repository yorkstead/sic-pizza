import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Clock,
  ChefHat,
  CreditCard,
  Plus,
  Flame,
  Check,
  CheckCircle2,
  Trash2,
  AlertCircle,
  QrCode,
  Sparkles,
  ArrowRightLeft,
  PieChart,
  UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { money } from "@/lib/utils";
import type {
  TableSession,
  TableSessionProjection,
  DiningStage
} from "@/lib/domain/models/session";
import type { PizzaSelection } from "@/lib/demo/sic-pizza/catalog";
import type { Course } from "@/lib/domain/models/menu";
import type { SplitMode, SelectedModifier } from "@/lib/domain/models/order";
import { StageBadge } from "./stage-badge";
import { AddItemDialog } from "./add-item-dialog";
import { VoidItemDialog } from "./void-item-dialog";
import { TransferTableDialog } from "./transfer-table-dialog";
import { SplitItemDialog } from "./split-item-dialog";
import { CreateRequestDialog } from "./create-request-dialog";
import { deriveRequestAgeMinutes, deriveRequestEscalation } from "@/lib/domain/models/request";
import type { RequestCategory } from "@/lib/domain/models/request";
import { deriveTableCoursePacing } from "@/lib/domain/models/pacing";

interface TableSessionViewProps {
  session: TableSession;
  projection: TableSessionProjection;
  currentServerId: string;
  onBackToFloor: () => void;
  onAddPizza: (
    pizza: PizzaSelection,
    ownership: { splitMode: SplitMode; assignedDinerIds: string[] },
    course?: Course,
    semanticModifiers?: SelectedModifier[]
  ) => void;
  onAddStandardItem: (
    name: string,
    priceCents: number,
    course: Course,
    stationId: string,
    ownership: { splitMode: SplitMode; assignedDinerIds: string[] }
  ) => void;
  onApproveItem: (itemId: string) => void;
  onVoidItem: (itemId: string, reason: string) => void;
  onUpdateItemOwnership: (
    itemId: string,
    ownership: {
      splitMode: SplitMode;
      assignedDinerIds: string[];
      customShares?: Record<string, number>;
    }
  ) => void;
  onFireCourse: (course: Course) => void;
  onAcceptTicket: (ticketId: string) => void;
  onStartTicketItem: (ticketId: string, orderItemId: string) => void;
  onMarkItemReady: (ticketId: string, orderItemId: string) => void;
  onDeliverItems: (ticketId: string, orderItemIds: string[]) => void;
  onAcknowledgeRequest: (requestId: string) => void;
  onClaimRequest?: (requestId: string, employeeId: string) => void;
  onStartRequest?: (requestId: string, employeeId: string) => void;
  onCompleteRequest: (requestId: string) => void;
  onCancelRequest?: (requestId: string, reason: string) => void;
  onCreateGuestRequest: (category: RequestCategory | string, notes?: string, dinerId?: string) => void;
  onSetStage: (stage: DiningStage) => void;
  onProcessPayment: (checkId: string, amountCents: number, tipCents: number) => void;
  onProcessDinerPayment: (dinerId: string, amountCents: number, tipCents: number) => void;
  onCreateCheck: (title: string, dinerIds?: string[]) => void;
  onTransferTable: (toEmployeeId: string, reason: string) => void;
  onAddDiner: (displayName: string) => void;
  onCloseSession: () => void;
}

export function TableSessionView({
  session,
  projection,
  currentServerId,
  onBackToFloor,
  onAddPizza,
  onAddStandardItem,
  onApproveItem,
  onVoidItem,
  onUpdateItemOwnership,
  onFireCourse,
  onAcceptTicket,
  onStartTicketItem,
  onMarkItemReady,
  onDeliverItems,
  onAcknowledgeRequest,
  onClaimRequest,
  onStartRequest,
  onCompleteRequest,
  onCancelRequest,
  onCreateGuestRequest,
  onSetStage,
  onProcessPayment,
  onProcessDinerPayment,
  onCreateCheck,
  onTransferTable,
  onAddDiner,
  onCloseSession
}: TableSessionViewProps) {
  const [activeTab, setActiveTab] = useState<
    "orders" | "kitchen" | "requests" | "checks" | "history" | "diners"
  >("orders");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCreateRequestOpen, setIsCreateRequestOpen] = useState(false);
  const [voidingItem, setVoidingItem] = useState<{ id: string; name: string } | null>(null);
  const [splittingItem, setSplittingItem] = useState<{
    id: string;
    name: string;
    totalCents: number;
    splitMode: SplitMode;
    assignedDinerIds: string[];
  } | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [newDinerName, setNewDinerName] = useState("");
  const [isAddingDiner, setIsAddingDiner] = useState(false);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number>(20);

  // Group items by course
  const courses: Course[] = ["drinks", "starters", "salad", "mains", "desserts", "custom"];
  const courseLabels: Record<Course, string> = {
    drinks: "Drinks & Cocktails",
    starters: "Starters & Small Plates",
    appetizer: "Appetizers",
    salad: "Salads & Greens",
    mains: "Pizzas & Entrées",
    entree: "Entrées",
    desserts: "Desserts & Pastry",
    dessert: "Desserts",
    custom: "Special / Chef Course"
  };

  const activeItems = session.items.filter((i) => i.status !== "voided");
  const proposedItems = activeItems.filter((i) => i.status === "proposed");
  const openRequests = session.requests.filter(
    (r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS"
  );

  // Derive primary next action
  let primaryAction: { label: string; onClick: () => void; icon: React.ComponentType<{ className?: string }> } | null = null;

  if (proposedItems.length > 0) {
    primaryAction = {
      label: `Approve ${proposedItems.length} Guest Proposal${proposedItems.length > 1 ? "s" : ""}`,
      onClick: () => {
        proposedItems.forEach((item) => onApproveItem(item.id));
      },
      icon: CheckCircle2
    };
  } else if (activeItems.some((i) => i.course === "drinks" && i.status === "confirmed")) {
    primaryAction = {
      label: "Fire Drinks to Bar",
      onClick: () => onFireCourse("drinks"),
      icon: Flame
    };
  } else if (activeItems.some((i) => i.course === "starters" && i.status === "confirmed")) {
    primaryAction = {
      label: "Fire Starters to Kitchen",
      onClick: () => onFireCourse("starters"),
      icon: Flame
    };
  } else if (activeItems.some((i) => i.course === "mains" && i.status === "confirmed")) {
    primaryAction = {
      label: "Fire Pizzas / Mains",
      onClick: () => onFireCourse("mains"),
      icon: Flame
    };
  } else if (openRequests.some((r) => r.category === "CHECK")) {
    primaryAction = {
      label: "Present Pre-Split Check",
      onClick: () => {
        if (session.checks.length === 0) {
          onCreateCheck("Full Table Check");
        }
        setActiveTab("checks");
      },
      icon: CreditCard
    };
  } else if (projection.unpaidBalanceCents === 0 && projection.totalCents > 0 && !session.closedAt) {
    primaryAction = {
      label: "Close & Reset Table",
      onClick: onCloseSession,
      icon: Sparkles
    };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-20">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={onBackToFloor}
            aria-label="Back to floor"
          >
            <ArrowLeft className="size-5" />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-foreground">{session.tableLabel}</h1>
              <StageBadge stage={projection.stage} />
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="size-3.5" />
                {projection.elapsedMinutes}m seated
              </span>

              <span className="flex items-center gap-1">
                <Users className="size-3.5" />
                {projection.diners.length} guests
              </span>

              <button
                onClick={() => setIsTransferOpen(true)}
                className="flex items-center gap-1 text-primary underline hover:text-primary/80"
              >
                <ArrowRightLeft className="size-3" />
                {session.assignedServerId === currentServerId
                  ? "Jordan (You)"
                  : session.assignedServerId || "Unassigned"}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stage Picker */}
        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <span className="text-xs font-bold text-muted-foreground">Stage:</span>
          <select
            value={projection.stage}
            onChange={(e) => onSetStage(e.target.value as DiningStage)}
            className="h-9 rounded-lg border bg-background px-2.5 font-mono text-xs font-bold text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
          >
            {(
              [
                "SEATED",
                "DRINKS",
                "ORDERING",
                "APPETIZERS",
                "ENTREES",
                "DESSERT",
                "CHECK_REQUESTED",
                "PAYING",
                "CLOSED"
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Urgent Attention Alert Bar */}
      {projection.operationalAttention.isAttentionRequired && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/20 p-3.5 text-red-200">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0 text-red-400" />
              <span className="text-xs font-bold">
                {projection.operationalAttention.reasons.join(" · ")}
              </span>
            </div>

            {openRequests.length > 0 && (
              <div className="flex gap-1.5">
                {openRequests[0].status === "OPEN" && (
                  <Button
                    size="default"
                    variant="danger"
                    className="h-8 px-2.5 text-xs"
                    onClick={() => onAcknowledgeRequest(openRequests[0].id)}
                  >
                    Acknowledge
                  </Button>
                )}
                <Button
                  size="default"
                  variant="secondary"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => onCompleteRequest(openRequests[0].id)}
                >
                  <Check className="size-3.5" />
                  Done
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Course Pacing Directive & Coordination Bar */}
      {(() => {
        const pacing = deriveTableCoursePacing(session);
        if (pacing.courses.length === 0) return null;

        return (
          <div className="rounded-2xl border bg-card p-3.5 shadow-sm space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                  <Flame className="size-3.5" />
                  Course Pacing Engine
                </span>
                {pacing.hasPacingAlert && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px] font-mono">
                    Attention
                  </Badge>
                )}
              </div>
              <span className="text-xs font-bold text-foreground">
                {pacing.serverPacingMessage}
              </span>
            </div>

            {/* Course Progression Stepper */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pacing.courses.map((cs) => {
                const isUnfired = cs.status === "unfired";
                const isDelivered = cs.status === "delivered";
                const isReady = cs.status === "ready";
                const isInPrep = cs.status === "in_prep" || cs.status === "fired";

                return (
                  <div
                    key={cs.course}
                    className={`rounded-xl border p-2.5 flex flex-col justify-between text-xs transition ${
                      isDelivered
                        ? "bg-secondary/40 border-border text-muted-foreground"
                        : isReady
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                        : isInPrep
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                        : cs.shouldFireNow
                        ? "bg-primary/10 border-primary text-foreground shadow-xs animate-pulse"
                        : "bg-card border-border text-foreground"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono font-bold uppercase text-[11px] block">
                          {cs.course}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {cs.itemsCount} item{cs.itemsCount > 1 ? "s" : ""} · ~{cs.estimatedPrepMinutes}m
                        </span>
                      </div>
                      <Badge className="text-[9px] font-mono px-1 py-0 uppercase">
                        {cs.status}
                      </Badge>
                    </div>

                    <div className="mt-2 pt-1 border-t border-border/50 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        {cs.pacingMode}
                      </span>
                      {isUnfired && (
                        <Button
                          size="default"
                          variant="secondary"
                          className="h-6 px-2 text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                          onClick={() => onFireCourse(cs.course)}
                        >
                          Fire Now
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Primary Action Button (Thumb zone) */}
      {primaryAction && (
        <Button
          size="lg"
          className="w-full text-base shadow-md transition-transform active:scale-[0.99]"
          onClick={primaryAction.onClick}
        >
          <primaryAction.icon className="size-5" />
          {primaryAction.label}
        </Button>
      )}

      {/* Operational Navigation Tabs */}
      <div className="grid grid-cols-6 border-b bg-card rounded-xl p-1 font-mono text-[11px] font-bold uppercase tracking-wider">
        <button
          onClick={() => setActiveTab("orders")}
          className={`flex flex-col items-center justify-center py-2.5 rounded-lg transition ${
            activeTab === "orders" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Orders</span>
          <span className="text-[10px] opacity-80">{activeItems.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("kitchen")}
          className={`flex flex-col items-center justify-center py-2.5 rounded-lg transition ${
            activeTab === "kitchen" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Kitchen</span>
          <span className="text-[10px] opacity-80">{session.tickets.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`flex flex-col items-center justify-center py-2.5 rounded-lg transition relative ${
            activeTab === "requests" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {openRequests.length > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-400 animate-pulse" />
          )}
          <span>Tasks</span>
          <span className="text-[10px] opacity-80">{openRequests.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("checks")}
          className={`flex flex-col items-center justify-center py-2.5 rounded-lg transition ${
            activeTab === "checks" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Split Bill</span>
          <span className="text-[10px] opacity-80">{money(projection.totalCents)}</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center justify-center py-2.5 rounded-lg transition ${
            activeTab === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Audit</span>
          <span className="text-[10px] opacity-80">{session.events.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("diners")}
          className={`flex flex-col items-center justify-center py-2.5 rounded-lg transition ${
            activeTab === "diners" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Guests</span>
          <span className="text-[10px] opacity-80">{session.diners.length}</span>
        </button>
      </div>

      {/* Tab 1: Orders & Coursing */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-foreground">Table Orders</h2>
            <Button size="default" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" />
              Add Items
            </Button>
          </div>

          {activeItems.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <ChefHat className="mx-auto size-8 opacity-40" />
                <p className="mt-2 text-sm font-semibold">No active items on this table.</p>
                <p className="text-xs">Add food or drinks using the button above.</p>
              </CardContent>
            </Card>
          ) : (
            courses.map((course) => {
              const courseItems = activeItems.filter((i) => i.course === course);
              if (courseItems.length === 0) return null;

              const hasUnfired = courseItems.some(
                (i) => i.status === "confirmed" || i.status === "held"
              );

              return (
                <Card key={course} className="overflow-hidden">
                  <CardHeader className="flex flex-row items-center justify-between border-b bg-secondary/30 py-3">
                    <div>
                      <h3 className="font-bold text-foreground text-sm">
                        {courseLabels[course]}
                      </h3>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {courseItems.length} item{courseItems.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    {hasUnfired && (
                      <Button
                        size="default"
                        className="h-8 px-3 text-xs"
                        onClick={() => onFireCourse(course)}
                      >
                        <Flame className="size-3.5" />
                        Fire {course.toUpperCase()}
                      </Button>
                    )}
                  </CardHeader>

                  <CardContent className="divide-y p-0">
                    {courseItems.map((item) => {
                      const isProposed = item.status === "proposed";
                      const itemTotalCents =
                        (item.basePriceCents +
                          item.selectedModifiers.reduce((acc, m) => acc + m.priceCents, 0)) *
                        item.quantity;

                      // Derive ownership label
                      let ownershipLabel = "Table";
                      if (item.splitMode === "whole_table") {
                        ownershipLabel = `Whole Table (${session.diners.length} guests)`;
                      } else if (item.splitMode === "shared_diners" && item.assignedDinerIds.length > 0) {
                        const names = item.assignedDinerIds
                          .map((id) => session.diners.find((d) => d.id === id)?.displayName || "Guest")
                          .join(", ");
                        ownershipLabel = `Shared: ${names}`;
                      } else {
                        const singleDiner = session.diners.find(
                          (d) => d.id === (item.dinerId || item.assignedDinerIds[0])
                        );
                        ownershipLabel = singleDiner
                          ? `${singleDiner.displayName}${singleDiner.seatNumber ? ` (Seat ${singleDiner.seatNumber})` : ""}`
                          : "Table";
                      }

                      return (
                        <div
                          key={item.id}
                          className={`p-4 transition ${
                            isProposed ? "bg-amber-950/10 border-l-4 border-l-amber-500" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <strong className="text-sm font-bold text-foreground">
                                  {item.quantity} × {item.name}
                                </strong>
                                <Badge
                                  className={
                                    isProposed
                                      ? "border-amber-500/50 bg-amber-500/20 text-amber-300"
                                      : item.status === "ready"
                                      ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                                      : ""
                                  }
                                >
                                  {item.status}
                                </Badge>
                              </div>

                              {/* Diner Ownership Badge & Split Action */}
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  onClick={() =>
                                    setSplittingItem({
                                      id: item.id,
                                      name: item.name,
                                      totalCents: itemTotalCents,
                                      splitMode: item.splitMode || "single",
                                      assignedDinerIds: item.assignedDinerIds || (item.dinerId ? [item.dinerId] : [])
                                    })
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-medium text-foreground hover:bg-muted transition"
                                  title="Click to change ownership / split"
                                >
                                  <PieChart className="size-3 text-primary" />
                                  <span>{ownershipLabel}</span>
                                </button>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  Station: {item.stationId}
                                </span>
                              </div>

                              {/* Modifiers */}
                              {item.selectedModifiers.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  +{" "}
                                  {item.selectedModifiers
                                    .map((m) => m.name)
                                    .join(", ")}
                                </p>
                              )}

                              {/* Special Instructions */}
                              {item.specialInstructions && (
                                <p className="text-xs italic text-amber-300/90">
                                  &ldquo;{item.specialInstructions}&rdquo;
                                </p>
                              )}
                            </div>

                            {/* Price & Actions */}
                            <div className="text-right">
                              <span className="font-mono text-sm font-bold text-foreground">
                                {money(itemTotalCents)}
                              </span>

                              <div className="mt-2 flex items-center justify-end gap-1.5">
                                {isProposed && (
                                  <Button
                                    size="default"
                                    className="h-8 px-3 text-xs"
                                    onClick={() => onApproveItem(item.id)}
                                  >
                                    <Check className="size-3.5" />
                                    Approve
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setVoidingItem({ id: item.id, name: item.name })}
                                  aria-label="Void item"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Kitchen & Station Display */}
      {activeTab === "kitchen" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-foreground">Kitchen Station Tickets</h2>
            <Badge className="font-mono">{projection.kitchenProgress}</Badge>
          </div>

          {session.tickets.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <ChefHat className="mx-auto size-8 opacity-40" />
                <p className="mt-2 text-sm font-semibold">No active tickets fired to kitchen.</p>
                <p className="text-xs">Fire courses from the Orders tab to route to stations.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {session.tickets.map((ticket) => (
                <Card key={ticket.id} className="border-t-4 border-t-primary">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Station: {ticket.stationId}
                      </span>
                      <h3 className="font-bold text-foreground text-sm">
                        Course: {ticket.course.toUpperCase()}
                      </h3>
                    </div>
                    <Badge
                      className={
                        ticket.status === "ready"
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : ""
                      }
                    >
                      {ticket.status}
                    </Badge>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-2">
                    <div className="divide-y border-y text-xs">
                      {ticket.items.map((tItem) => (
                        <div key={tItem.orderItemId} className="py-2 flex justify-between items-center">
                          <div>
                            <strong>
                              {tItem.quantity} × {tItem.name}
                            </strong>
                            {tItem.modifiers.length > 0 && (
                              <p className="text-[11px] text-muted-foreground">
                                {tItem.modifiers.join(", ")}
                              </p>
                            )}
                            {tItem.dinerName && (
                              <p className="text-[10px] text-muted-foreground">
                                For: {tItem.dinerName}
                              </p>
                            )}
                          </div>
                          <Badge className="text-[10px] px-1.5 py-0.5">{tItem.status}</Badge>
                        </div>
                      ))}
                    </div>

                    {/* Interactive Station Actions */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {ticket.status === "queued" && (
                        <Button
                          size="default"
                          variant="secondary"
                          className="h-8 flex-1 text-xs"
                          onClick={() => onAcceptTicket(ticket.id)}
                        >
                          Accept Ticket
                        </Button>
                      )}

                      {ticket.status === "accepted" && (
                        <Button
                          size="default"
                          className="h-8 flex-1 text-xs"
                          onClick={() =>
                            ticket.items.forEach((i) =>
                              onStartTicketItem(ticket.id, i.orderItemId)
                            )
                          }
                        >
                          Start All Prep
                        </Button>
                      )}

                      {ticket.status === "in_prep" && (
                        <Button
                          size="default"
                          className="h-8 flex-1 text-xs"
                          onClick={() =>
                            ticket.items.forEach((i) =>
                              onMarkItemReady(ticket.id, i.orderItemId)
                            )
                          }
                        >
                          Mark Ready (Expo)
                        </Button>
                      )}

                      {ticket.status === "ready" && (
                        <Button
                          size="default"
                          variant="default"
                          className="h-8 flex-1 text-xs"
                          onClick={() =>
                            onDeliverItems(
                              ticket.id,
                              ticket.items.map((i) => i.orderItemId)
                            )
                          }
                        >
                          Deliver to Table
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Guest Requests & Tasks */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-foreground">Operational Tasks & Requests</h2>
              <p className="text-xs text-muted-foreground">
                Live queue for Table {session.tableLabel} with automated role routing.
              </p>
            </div>
            <Button
              size="default"
              className="text-xs"
              onClick={() => setIsCreateRequestOpen(true)}
            >
              <Plus className="size-3.5 mr-1" />
              Log Request
            </Button>
          </div>

          {/* Quick Task Dispatch for Server */}
          <Card>
            <CardHeader className="pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Quick Task Buttons
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["SERVER_NEEDED", "Server Needed"],
                    ["REFILL", "Water Refill"],
                    ["CONDIMENT", "Condiments / Sauces"],
                    ["CHECK", "Drop Check"],
                    ["TO_GO_BOX", "To-Go Boxes"],
                    ["UTENSILS", "Extra Utensils"],
                    ["FOOD_ISSUE", "Food Issue (Mgr)"],
                    ["MISSING_ITEM", "Missing Item (Expo)"]
                  ] as const
                ).map(([cat, label]) => (
                  <Button
                    key={cat}
                    size="default"
                    variant="secondary"
                    className="text-xs"
                    onClick={() => onCreateGuestRequest(cat)}
                  >
                    + {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {session.requests.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto size-8 text-emerald-400 opacity-50" />
                <p className="mt-2 text-sm font-semibold">All table requests resolved.</p>
                <p className="text-xs">No outstanding tasks for this table.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {session.requests.map((req) => {
                const ageMinutes = deriveRequestAgeMinutes(req.createdAt);
                const escalation = deriveRequestEscalation(req);
                const isComplete = req.status === "COMPLETED";
                const isCancelled = req.status === "CANCELLED";
                const isOpen = req.status === "OPEN";
                const isAck = req.status === "ACKNOWLEDGED";
                const isInPrep = req.status === "IN_PROGRESS";

                return (
                  <Card
                    key={req.id}
                    className={`p-4 border-2 transition ${
                      escalation === "ESCALATED"
                        ? "border-destructive/80 bg-destructive/10"
                        : escalation === "OVERDUE"
                        ? "border-amber-500/70 bg-amber-950/15"
                        : req.priority === "URGENT"
                        ? "border-destructive/40 bg-card"
                        : isComplete || isCancelled
                        ? "opacity-60 border-border"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-bold text-foreground capitalize">
                            {(req.category || req.type || "OTHER").replace(/_/g, " ")}
                          </strong>

                          <Badge
                            className={
                              req.priority === "URGENT"
                                ? "border-destructive bg-destructive/20 text-destructive-foreground font-black"
                                : req.priority === "HIGH"
                                ? "border-amber-500 bg-amber-500/20 text-amber-300 font-bold"
                                : "text-muted-foreground"
                            }
                          >
                            {req.priority || "NORMAL"}
                          </Badge>

                          {escalation === "ESCALATED" && (
                            <Badge className="border-red-500 bg-red-600 text-white font-black animate-pulse">
                              🚨 ESCALATED (MGR)
                            </Badge>
                          )}
                          {escalation === "OVERDUE" && (
                            <Badge className="border-amber-500 bg-amber-500/30 text-amber-200 font-bold">
                              ⚠️ OVERDUE
                            </Badge>
                          )}

                          <Badge className="text-[10px] uppercase font-mono">
                            {req.status}
                          </Badge>
                        </div>

                        {req.description && (
                          <p className="text-xs text-foreground/90 font-medium">
                            {req.description}
                          </p>
                        )}
                        {req.notes && req.notes !== req.description && (
                          <p className="text-xs italic text-muted-foreground">
                            &ldquo;{req.notes}&rdquo;
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                          {req.dinerName && (
                            <span>
                              From: <strong className="text-foreground">{req.dinerName}</strong>
                            </span>
                          )}
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="size-3" />
                            {isComplete ? `Resolved in ${ageMinutes}m` : `${ageMinutes}m ago`}
                          </span>
                          <span>
                            Role: <strong className="text-foreground capitalize">{req.assignedRole || "server"}</strong>
                          </span>
                          {req.assignedEmployeeId && (
                            <span>
                              Assigned: <strong className="text-foreground">{req.assignedEmployeeId}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {!isComplete && !isCancelled && (
                        <div className="flex flex-col sm:flex-row items-end gap-1.5 shrink-0">
                          {isOpen && (
                            <>
                              <Button
                                size="default"
                                variant="secondary"
                                className="h-8 text-xs"
                                onClick={() => onAcknowledgeRequest(req.id)}
                              >
                                Acknowledge
                              </Button>
                              <Button
                                size="default"
                                className="h-8 text-xs"
                                onClick={() => onClaimRequest?.(req.id, currentServerId)}
                              >
                                Claim
                              </Button>
                            </>
                          )}

                          {isAck && (
                            <Button
                              size="default"
                              className="h-8 text-xs"
                              onClick={() => onStartRequest?.(req.id, currentServerId)}
                            >
                              Start
                            </Button>
                          )}

                          {(isOpen || isAck || isInPrep) && (
                            <Button
                              size="default"
                              variant="default"
                              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                              onClick={() => onCompleteRequest(req.id)}
                            >
                              <Check className="size-3.5 mr-1" />
                              Complete
                            </Button>
                          )}

                          {onCancelRequest && (
                            <Button
                              variant="ghost"
                              size="default"
                              className="h-8 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => onCancelRequest(req.id, "Cancelled by server")}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Pre-Split Checks & Diner Ownership Breakdown */}
      {activeTab === "checks" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                Continuous Diner Allocation
              </span>
              <h2 className="text-xl font-black text-foreground">
                The Pre-Split Check
              </h2>
            </div>
            <Badge className="font-mono">
              {projection.tableSummary.isFullyPaid ? "Fully Settled" : "Open Balance"}
            </Badge>
          </div>

          {/* Table Financial Summary Card */}
          <Card>
            <CardContent className="p-5 space-y-2.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Individual Items Subtotal</span>
                <span className="font-mono">{money(projection.tableSummary.individualSubtotalCents)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Shared Items Subtotal</span>
                <span className="font-mono">{money(projection.tableSummary.sharedSubtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-foreground border-t pt-2">
                <span>Table Subtotal</span>
                <span className="font-mono">{money(projection.tableSummary.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Tax (8.25%)</span>
                <span className="font-mono">{money(projection.tableSummary.taxCents)}</span>
              </div>
              <div className="flex justify-between text-lg font-black text-foreground border-t pt-2">
                <span>Table Total</span>
                <span className="font-mono">{money(projection.tableSummary.totalCents)}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-400 font-bold">
                <span>Total Paid</span>
                <span className="font-mono">{money(projection.tableSummary.paidCents)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-primary border-t pt-2">
                <span>Remaining Table Balance</span>
                <span className="font-mono">{money(projection.tableSummary.unpaidBalanceCents)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Shared Items Proportional Breakdown */}
          {projection.sharedItems.length > 0 && (
            <Card>
              <CardHeader className="py-3 border-b bg-secondary/30">
                <div className="flex items-center gap-2">
                  <PieChart className="size-4 text-primary" />
                  <h3 className="font-bold text-foreground text-sm">
                    Shared Item Allocations
                  </h3>
                </div>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {projection.sharedItems.map((si) => (
                  <div key={si.orderItemId} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-sm text-foreground">{si.name}</strong>
                      <span className="font-mono text-xs font-bold text-foreground">
                        {money(si.itemTotalCents)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {si.allocations.map((a) => (
                        <div
                          key={a.dinerId}
                          className="rounded-lg border bg-background/50 p-2 text-xs"
                        >
                          <span className="block font-semibold text-foreground truncate">
                            {a.displayName}
                          </span>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                            <span>{a.sharePercentageText}</span>
                            <span className="font-bold text-foreground">{money(a.cents)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Individual Diner Checks */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Individual Diner Balances ({projection.dinerBills.length} Guests)
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {projection.dinerBills.map((bill) => (
                <Card
                  key={bill.dinerId}
                  className={`overflow-hidden border-2 transition ${
                    bill.isFullyPaid
                      ? "border-emerald-500/40 bg-emerald-950/10"
                      : "border-border bg-card"
                  }`}
                >
                  <CardHeader className="flex flex-row items-center justify-between bg-secondary/30 py-3">
                    <div>
                      <h4 className="font-black text-foreground text-sm flex items-center gap-1.5">
                        <UserCheck className="size-3.5 text-primary" />
                        {bill.displayName}
                      </h4>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Seat {bill.seatNumber || "-"}
                      </span>
                    </div>

                    {bill.isFullyPaid ? (
                      <Badge className="border-emerald-500 text-emerald-300">Paid in Full</Badge>
                    ) : (
                      <span className="font-mono text-sm font-black text-primary">
                        {money(bill.unpaidBalanceCents)}
                      </span>
                    )}
                  </CardHeader>

                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="space-y-1 text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Individual Items</span>
                        <span className="font-mono">{money(bill.individualSubtotalCents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Shared Items Share</span>
                        <span className="font-mono">{money(bill.sharedSubtotalCents)}</span>
                      </div>
                      <div className="flex justify-between font-medium text-foreground">
                        <span>Subtotal</span>
                        <span className="font-mono">{money(bill.subtotalCents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Allocated Tax</span>
                        <span className="font-mono">{money(bill.taxCents)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-foreground border-t pt-1">
                        <span>Total Due</span>
                        <span className="font-mono">{money(bill.totalCents)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Paid</span>
                        <span className="font-mono">{money(bill.paidCents)}</span>
                      </div>
                    </div>

                    {/* 1-Tap Diner Payment */}
                    {bill.unpaidBalanceCents > 0 && (
                      <div className="pt-2 border-t space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-muted-foreground">Tip Preset</span>
                          <div className="flex gap-1">
                            {[15, 18, 20, 25].map((pct) => (
                              <button
                                key={pct}
                                onClick={() => setSelectedTipPercent(pct)}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                                  selectedTipPercent === pct
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </div>

                        <Button
                          size="default"
                          className="w-full text-xs"
                          onClick={() => {
                            const tipCents = Math.round(
                              (bill.unpaidBalanceCents * selectedTipPercent) / 100
                            );
                            onProcessDinerPayment(
                              bill.dinerId,
                              bill.unpaidBalanceCents,
                              tipCents
                            );
                          }}
                        >
                          <CreditCard className="size-3.5" />
                          Pay {money(bill.unpaidBalanceCents)} + {money(Math.round((bill.unpaidBalanceCents * selectedTipPercent) / 100))} Tip
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Pay Full Table Balance Shortcut */}
          {projection.tableSummary.unpaidBalanceCents > 0 && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div>
                  <strong className="block text-sm text-foreground">One-Tap Table Payment</strong>
                  <span className="text-xs text-muted-foreground">
                    Settle entire remaining table balance of {money(projection.tableSummary.unpaidBalanceCents)} at once.
                  </span>
                </div>
                <Button
                  size="default"
                  onClick={() => {
                    const check = session.checks[0];
                    const checkId = check ? check.id : "table_check";
                    if (session.checks.length === 0) {
                      onCreateCheck("Table Check");
                    }
                    onProcessPayment(
                      checkId,
                      projection.tableSummary.unpaidBalanceCents,
                      Math.round((projection.tableSummary.unpaidBalanceCents * selectedTipPercent) / 100)
                    );
                  }}
                >
                  <CreditCard className="size-4" />
                  Pay Full Table Balance ({money(projection.tableSummary.unpaidBalanceCents)})
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Close table if fully settled */}
          {projection.unpaidBalanceCents === 0 && projection.totalCents > 0 && !session.closedAt && (
            <Button
              size="lg"
              variant="default"
              className="w-full text-base"
              onClick={onCloseSession}
            >
              <Sparkles className="size-5" />
              Close Session & Reset Table
            </Button>
          )}
        </div>
      )}

      {/* Tab 5: Activity & Audit Stream */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-foreground">Table Activity Timeline</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {session.events.length} domain events recorded
            </span>
          </div>

          <Card>
            <CardContent className="p-5">
              <ol className="relative ml-2 border-l border-border/80">
                {[...session.events].reverse().map((evt) => (
                  <li key={evt.id} className="relative mb-6 ml-5 last:mb-0">
                    <span className="absolute -left-[27px] top-1 size-3.5 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="text-[10px] font-mono">{evt.type}</Badge>
                      <time className="font-mono text-xs text-muted-foreground">
                        {new Date(evt.timestamp).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                          second: "2-digit"
                        })}
                      </time>
                      <span className="text-xs text-muted-foreground">
                        · {evt.actorType} {evt.actorId ? `(${evt.actorId})` : ""}
                      </span>
                    </div>

                    <div className="mt-1.5 rounded-lg bg-secondary/30 p-2.5 text-xs text-foreground font-mono">
                      {JSON.stringify(evt.payload, null, 2)}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 6: Diners & Table Access */}
      {activeTab === "diners" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-foreground">Seated Guests</h2>
            <Button
              size="default"
              variant="secondary"
              onClick={() => setIsAddingDiner(true)}
            >
              <Plus className="size-4" />
              Add Diner
            </Button>
          </div>

          {/* Add Diner Inline */}
          {isAddingDiner && (
            <Card className="p-4 border-primary">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Guest name..."
                  value={newDinerName}
                  onChange={(e) => setNewDinerName(e.target.value)}
                  className="h-10 flex-1 rounded-xl border bg-background px-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                <Button
                  size="default"
                  onClick={() => {
                    if (newDinerName.trim()) {
                      onAddDiner(newDinerName.trim());
                      setNewDinerName("");
                      setIsAddingDiner(false);
                    }
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="default"
                  onClick={() => setIsAddingDiner(false)}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {session.diners.map((diner) => (
              <Card key={diner.id} className="p-4 flex items-center justify-between">
                <div>
                  <strong className="block text-sm text-foreground">
                    {diner.displayName}
                  </strong>
                  <span className="font-mono text-xs text-muted-foreground">
                    Seat {diner.seatNumber || "-"} · Joined{" "}
                    {new Date(diner.joinedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
                <Users className="size-4 text-muted-foreground" />
              </Card>
            ))}
          </div>

          {/* QR Code and Guest Mobile Link */}
          <Card className="mt-6">
            <CardHeader className="pb-2">
              <h3 className="text-sm font-bold text-foreground">
                Guest Mobile Onboarding
              </h3>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center gap-4">
              <div className="grid size-36 grid-cols-5 gap-1 rounded-xl bg-white p-3">
                {Array.from({ length: 25 }, (_, i) => (
                  <span
                    key={i}
                    className={`${
                      [0, 1, 2, 4, 5, 7, 8, 10, 12, 14, 16, 18, 20, 21, 22, 23, 24].includes(i)
                        ? "bg-black"
                        : "bg-white"
                    }`}
                  />
                ))}
              </div>

              <div className="space-y-2 text-center sm:text-left">
                <span className="font-mono text-xs text-muted-foreground">
                  Join Token: {session.joinTokenHash}
                </span>
                <p className="text-xs text-muted-foreground">
                  Guests scan this QR tableside to open live item proposals and call staff.
                </p>
                <Link
                  href={`/join/SIC-${session.tableLabel.replace(/\D/g, "") || "11"}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary underline"
                >
                  <QrCode className="size-3.5" />
                  Open Live Guest Preview (/join/SIC-{session.tableLabel.replace(/\D/g, "") || "11"})
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialogs */}
      <AddItemDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        diners={session.diners}
        onAddPizza={onAddPizza}
        onAddDrink={(name, priceCents, ownership) =>
          onAddStandardItem(name, priceCents, "drinks", "bar", ownership)
        }
        onAddStarter={(name, priceCents, ownership) =>
          onAddStandardItem(name, priceCents, "starters", "cold-prep", ownership)
        }
      />

      {splittingItem && (
        <SplitItemDialog
          isOpen={true}
          onClose={() => setSplittingItem(null)}
          itemName={splittingItem.name}
          itemTotalCents={splittingItem.totalCents}
          diners={session.diners}
          currentSplitMode={splittingItem.splitMode}
          currentAssignedDinerIds={splittingItem.assignedDinerIds}
          onConfirmSplit={(ownership) => {
            onUpdateItemOwnership(splittingItem.id, ownership);
            setSplittingItem(null);
          }}
        />
      )}

      {voidingItem && (
        <VoidItemDialog
          isOpen={true}
          onClose={() => setVoidingItem(null)}
          itemName={voidingItem.name}
          onConfirmVoid={(reason) => {
            onVoidItem(voidingItem.id, reason);
            setVoidingItem(null);
          }}
        />
      )}

      <TransferTableDialog
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        session={session}
        tableLabel={session.tableLabel}
        currentServerName={session.assignedServerId || "Jordan"}
        onConfirmTransfer={onTransferTable}
      />

      <CreateRequestDialog
        open={isCreateRequestOpen}
        onClose={() => setIsCreateRequestOpen(false)}
        tableLabel={session.tableLabel}
        diners={session.diners}
        onCreateRequest={(category, desc, dinerId) => {
          onCreateGuestRequest(category, desc, dinerId);
        }}
      />
    </div>
  );
}
