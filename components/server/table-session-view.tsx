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
  ArrowRightLeft
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
import type { RequestType } from "@/lib/domain/models/request";
import { StageBadge } from "./stage-badge";
import { AddItemDialog } from "./add-item-dialog";
import { VoidItemDialog } from "./void-item-dialog";
import { TransferTableDialog } from "./transfer-table-dialog";

interface TableSessionViewProps {
  session: TableSession;
  projection: TableSessionProjection;
  currentServerId: string;
  onBackToFloor: () => void;
  onAddPizza: (pizza: PizzaSelection, dinerId?: string, course?: Course) => void;
  onAddStandardItem: (name: string, priceCents: number, course: Course, stationId: string, dinerId?: string) => void;
  onApproveItem: (itemId: string) => void;
  onVoidItem: (itemId: string, reason: string) => void;
  onFireCourse: (course: Course) => void;
  onAcceptTicket: (ticketId: string) => void;
  onStartTicketItem: (ticketId: string, orderItemId: string) => void;
  onMarkItemReady: (ticketId: string, orderItemId: string) => void;
  onDeliverItems: (ticketId: string, orderItemIds: string[]) => void;
  onAcknowledgeRequest: (requestId: string) => void;
  onCompleteRequest: (requestId: string) => void;
  onCreateGuestRequest: (type: RequestType, notes?: string) => void;
  onSetStage: (stage: DiningStage) => void;
  onProcessPayment: (checkId: string, amountCents: number, tipCents: number) => void;
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
  onFireCourse,
  onAcceptTicket,
  onStartTicketItem,
  onMarkItemReady,
  onDeliverItems,
  onAcknowledgeRequest,
  onCompleteRequest,
  onCreateGuestRequest,
  onSetStage,
  onProcessPayment,
  onCreateCheck,
  onTransferTable,
  onAddDiner,
  onCloseSession
}: TableSessionViewProps) {
  const [activeTab, setActiveTab] = useState<
    "orders" | "kitchen" | "requests" | "checks" | "history" | "diners"
  >("orders");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [voidingItem, setVoidingItem] = useState<{ id: string; name: string } | null>(null);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [newDinerName, setNewDinerName] = useState("");
  const [isAddingDiner, setIsAddingDiner] = useState(false);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number>(20);

  // Group items by course
  const courses: Course[] = ["drinks", "starters", "mains", "desserts"];
  const courseLabels: Record<Course, string> = {
    drinks: "Drinks & Cocktails",
    starters: "Starters & Small Plates",
    mains: "Pizzas & Entrees",
    desserts: "Desserts"
  };

  const activeItems = session.items.filter((i) => i.status !== "voided");
  const proposedItems = activeItems.filter((i) => i.status === "proposed");
  const openRequests = session.requests.filter(
    (r) => r.status === "pending" || r.status === "acknowledged"
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
  } else if (openRequests.some((r) => r.type === "drop_check")) {
    primaryAction = {
      label: "Present Check to Table",
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
                {openRequests[0].status === "pending" && (
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
          <span>Pay</span>
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
                      const diner = session.diners.find((d) => d.id === item.dinerId);
                      const isProposed = item.status === "proposed";

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

                              {/* Diner Attribution */}
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {diner && (
                                  <span className="font-medium text-foreground">
                                    {diner.displayName}{" "}
                                    {diner.seatNumber ? `(Seat ${diner.seatNumber})` : ""}
                                  </span>
                                )}
                                <span className="font-mono text-[11px]">
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
                                {money(
                                  (item.basePriceCents +
                                    item.selectedModifiers.reduce((acc, m) => acc + m.priceCents, 0)) *
                                    item.quantity
                                )}
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
            <h2 className="text-lg font-black text-foreground">Operational Tasks & Requests</h2>
          </div>

          {/* Quick Task Dispatch for Server */}
          <Card>
            <CardHeader className="pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Log New Table Request
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["water_refill", "Water Refill"],
                    ["condiments", "Condiments / Sauces"],
                    ["cutlery", "Extra Cutlery"],
                    ["drop_check", "Check Requested"],
                    ["spill_cleanup", "Spill Cleanup"]
                  ] as const
                ).map(([type, label]) => (
                  <Button
                    key={type}
                    size="default"
                    variant="secondary"
                    className="text-xs"
                    onClick={() => onCreateGuestRequest(type)}
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
                <p className="mt-2 text-sm font-semibold">All guest requests resolved.</p>
                <p className="text-xs">No pending tasks for this table.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {session.requests.map((req) => (
                <Card
                  key={req.id}
                  className={`p-4 ${
                    req.status === "pending"
                      ? "border-red-500/40 bg-red-950/10"
                      : req.status === "acknowledged"
                      ? "border-amber-500/40 bg-amber-950/10"
                      : "opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-bold text-foreground capitalize">
                          {req.type.replace("_", " ")}
                        </strong>
                        <Badge
                          className={
                            req.status === "pending"
                              ? "border-red-500 text-red-300"
                              : req.status === "acknowledged"
                              ? "border-amber-500 text-amber-300"
                              : "border-emerald-500 text-emerald-300"
                          }
                        >
                          {req.status}
                        </Badge>
                      </div>

                      {req.dinerName && (
                        <p className="text-xs text-muted-foreground">
                          From: {req.dinerName}
                        </p>
                      )}
                      {req.notes && (
                        <p className="text-xs italic text-muted-foreground">
                          &ldquo;{req.notes}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      {req.status === "pending" && (
                        <Button
                          size="default"
                          variant="secondary"
                          className="h-8 text-xs"
                          onClick={() => onAcknowledgeRequest(req.id)}
                        >
                          Acknowledge
                        </Button>
                      )}

                      {req.status !== "completed" && (
                        <Button
                          size="default"
                          className="h-8 text-xs"
                          onClick={() => onCompleteRequest(req.id)}
                        >
                          <Check className="size-3.5" />
                          Complete
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Checks & Payments */}
      {activeTab === "checks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-foreground">Checks & Settlement</h2>
            {session.checks.length === 0 && (
              <Button
                size="default"
                onClick={() => onCreateCheck("Full Table Check")}
              >
                + Create Check
              </Button>
            )}
          </div>

          {/* Financial Summary Card */}
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">{money(projection.subtotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax (8.25%)</span>
                <span className="font-mono">{money(projection.taxCents)}</span>
              </div>
              <div className="flex justify-between text-lg font-black text-foreground border-t pt-3">
                <span>Total Amount</span>
                <span className="font-mono">{money(projection.totalCents)}</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-400">
                <span>Total Paid</span>
                <span className="font-mono">{money(projection.paidCents)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-primary border-t pt-2">
                <span>Remaining Balance</span>
                <span className="font-mono">{money(projection.unpaidBalanceCents)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Active Checks List */}
          {session.checks.map((chk) => (
            <Card key={chk.id} className="overflow-hidden border-2">
              <CardHeader className="flex flex-row items-center justify-between bg-secondary/30 py-3">
                <div>
                  <h3 className="font-bold text-foreground text-sm">{chk.title}</h3>
                  <span className="font-mono text-xs text-muted-foreground">
                    Balance: {money(chk.balanceCents)}
                  </span>
                </div>
                <Badge>{chk.status}</Badge>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                {chk.balanceCents > 0 ? (
                  <div className="space-y-3">
                    {/* Tip Presets */}
                    <div>
                      <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
                        Tip Preset
                      </span>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[15, 18, 20, 25].map((pct) => (
                          <Button
                            key={pct}
                            size="default"
                            variant={selectedTipPercent === pct ? "default" : "secondary"}
                            className="h-8 text-xs font-mono"
                            onClick={() => setSelectedTipPercent(pct)}
                          >
                            {pct}%
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button
                      size="lg"
                      className="w-full text-sm"
                      onClick={() => {
                        const tipCents = Math.round(
                          (chk.balanceCents * selectedTipPercent) / 100
                        );
                        onProcessPayment(chk.id, chk.balanceCents, tipCents);
                      }}
                    >
                      <CreditCard className="size-4" />
                      Pay {money(chk.balanceCents)} + {money(Math.round((chk.balanceCents * selectedTipPercent) / 100))} Tip
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-400">
                    <CheckCircle2 className="size-5" />
                    Check Paid in Full
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

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
        onAddDrink={(name, priceCents, dinerId) =>
          onAddStandardItem(name, priceCents, "drinks", "bar", dinerId)
        }
        onAddStarter={(name, priceCents, dinerId) =>
          onAddStandardItem(name, priceCents, "starters", "cold-prep", dinerId)
        }
      />

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
        tableLabel={session.tableLabel}
        currentServerName={session.assignedServerId || "Jordan"}
        onConfirmTransfer={onTransferTable}
      />
    </div>
  );
}
