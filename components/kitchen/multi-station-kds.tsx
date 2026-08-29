import React, { useState } from "react";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Flame,
  ArrowRight,
  Filter,
  CheckCheck,
  Utensils
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  STANDARD_KITCHEN_STATIONS,
  deriveExpoOrderProjections,
  type KitchenTicket,
  type ExpoOrderProjection,
  type TicketStatus
} from "@/lib/domain/models/kitchen";
import type { TableSession } from "@/lib/domain/models/session";
import type { Course } from "@/lib/domain/models/menu";

interface MultiStationKDSProps {
  sessions: readonly TableSession[];
  onAcceptTicket: (sessionId: string, ticketId: string) => Promise<void>;
  onStartItem: (sessionId: string, ticketId: string, orderItemId: string) => Promise<void>;
  onMarkItemReady: (sessionId: string, ticketId: string, orderItemId: string) => Promise<void>;
  onDeliverTicket: (sessionId: string, ticketId: string, itemIds: string[]) => Promise<void>;
  onRecallTicket?: (sessionId: string, ticketId: string, reason?: string) => Promise<void>;
  onDeliverExpoCourse?: (sessionId: string, course: Course) => Promise<void>;
}

export function MultiStationKDS({
  sessions,
  onAcceptTicket,
  onStartItem,
  onMarkItemReady,
  onDeliverTicket,
  onRecallTicket,
  onDeliverExpoCourse
}: MultiStationKDSProps) {
  const [selectedStation, setSelectedStation] = useState<string>("all");
  const [showRecalls, setShowRecalls] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  const now = new Date();

  // Flatten all tickets across active sessions
  const allTickets: (KitchenTicket & { session: TableSession })[] = sessions.flatMap((s) =>
    s.tickets.map((t) => ({ ...t, session: s }))
  );

  // Active production tickets vs completed/recalled
  const activeTickets = allTickets.filter(
    (t) => t.status === "queued" || t.status === "accepted" || t.status === "in_prep" || t.status === "ready"
  );
  const completedTickets = allTickets.filter(
    (t) => t.status === "delivered" || t.status === "recalled"
  );

  const displayedTickets = (statusFilter === "active" ? activeTickets : allTickets).filter((t) => {
    if (selectedStation === "all") return true;
    if (selectedStation === "expo") return false; // Handled separately in Expo view
    return t.stationId.toLowerCase() === selectedStation.toLowerCase();
  });

  // Expo Consolidated Projections
  const expoProjections: ExpoOrderProjection[] = deriveExpoOrderProjections(
    activeTickets,
    now
  );

  function getTimerStyle(createdAt: string, status: TicketStatus) {
    if (status === "ready") {
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    }
    const ageMin = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000));
    if (ageMin >= 18) {
      return "text-rose-400 bg-rose-500/10 border-rose-500/30 animate-pulse";
    }
    if (ageMin >= 12) {
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    }
    return "text-muted-foreground bg-secondary/50 border-border";
  }

  function getTicketAgeMinutes(createdAt: string): number {
    return Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60000));
  }

  return (
    <div className="space-y-6">
      {/* Header & Stations Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1">
              <ChefHat className="size-3.5" />
              Kitchen Operating Engine
            </span>
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] font-mono">
              {activeTickets.length} Active Tickets
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl text-foreground">
            Multi-Station Kitchen Display (KDS)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One live order dynamically projected to specialized line stations & consolidated expo.
          </p>
        </div>

        {/* View Toggles & Recall Button */}
        <div className="flex items-center gap-2">
          <Button
            variant={showRecalls ? "default" : "secondary"}
            size="default"
            onClick={() => setShowRecalls(!showRecalls)}
            className="flex items-center gap-1.5 text-xs font-semibold"
          >
            <RotateCcw className="size-3.5" />
            Recently Bumped ({completedTickets.length})
          </Button>

          <div className="flex rounded-lg border bg-secondary/40 p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1 rounded-md transition font-bold ${
                statusFilter === "active" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-md transition font-bold ${
                statusFilter === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Station Filter Pills Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setSelectedStation("all")}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 ${
            selectedStation === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-secondary/60 text-secondary-foreground hover:bg-secondary"
          }`}
        >
          <Filter className="size-3.5" />
          All Stations ({activeTickets.length})
        </button>

        <button
          type="button"
          onClick={() => setSelectedStation("expo")}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 ${
            selectedStation === "expo"
              ? "bg-purple-600 text-white shadow-sm"
              : "bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20"
          }`}
        >
          <Sparkles className="size-3.5" />
          Expo Master Hub ({expoProjections.length})
        </button>

        {STANDARD_KITCHEN_STATIONS.filter((s) => s.id !== "expo").map((station) => {
          const count = activeTickets.filter((t) => t.stationId.toLowerCase() === station.id.toLowerCase()).length;
          const isSelected = selectedStation.toLowerCase() === station.id.toLowerCase();

          return (
            <button
              key={station.id}
              type="button"
              onClick={() => setSelectedStation(station.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-bold transition shrink-0 ${
                isSelected
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-secondary/60 text-secondary-foreground hover:bg-secondary"
              }`}
            >
              <span>{station.name}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                count > 0 ? "bg-primary/20 text-primary" : "text-muted-foreground"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recalls Drawer if toggled */}
      {showRecalls && (
        <div className="rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <RotateCcw className="size-4" />
              Recently Bumped Tickets (Click to Recall to Line)
            </h2>
            <Button size="default" variant="ghost" onClick={() => setShowRecalls(false)} className="text-xs">
              Close
            </Button>
          </div>

          {completedTickets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recently completed tickets.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {completedTickets.slice(0, 6).map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-xl border bg-card p-3 space-y-2 text-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-foreground">
                        {ticket.session.tableLabel} · Station: {ticket.stationId.toUpperCase()}
                      </span>
                      <Badge className="text-[10px]">{ticket.status}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground text-[11px]">
                      {ticket.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                    </p>
                  </div>

                  <Button
                    size="default"
                    variant="secondary"
                    className="w-full text-xs font-bold border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    onClick={async () => {
                      if (onRecallTicket) {
                        await onRecallTicket(ticket.sessionId, ticket.id, "Expo line recall");
                      }
                    }}
                  >
                    <RotateCcw className="size-3.5 mr-1" />
                    Recall to Line
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------------------
          1. EXPO MASTER CONSOLIDATION VIEW
         --------------------------------------------------------------------------------- */}
      {selectedStation === "expo" ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">Expo Master Quality Control</h2>
              <p className="text-xs text-muted-foreground">
                Consolidates multiple station tickets per table course. Deliver full orders when all stations are ready.
              </p>
            </div>
            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 font-mono text-xs">
              {expoProjections.length} Tables In Production
            </Badge>
          </div>

          {expoProjections.length === 0 ? (
            <Card className="py-12 text-center border-dashed">
              <CardContent className="space-y-2">
                <CheckCircle2 className="mx-auto size-10 text-emerald-500/70" />
                <h3 className="font-bold text-foreground">All Stations Clear at Expo</h3>
                <p className="text-xs text-muted-foreground">
                  No pending course orders requiring quality control or delivery.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {expoProjections.map((proj) => {
                const isLate = proj.ageMinutes >= 18;
                return (
                  <Card
                    key={`${proj.sessionId}:${proj.course}`}
                    className={`overflow-hidden border-2 ${
                      proj.isAllStationsReady
                        ? "border-emerald-500/60 bg-emerald-500/5 shadow-md shadow-emerald-500/10"
                        : isLate
                        ? "border-rose-500/60 bg-rose-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <CardHeader className="p-4 pb-2 border-b bg-background/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-base font-black text-foreground">
                              {proj.tableLabel}
                            </span>
                            <Badge className="font-mono text-[10px] uppercase bg-secondary">
                              {proj.course}
                            </Badge>
                          </div>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            Order #{proj.orderId.slice(-4)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-xs font-mono font-bold">
                          <Clock className="size-3.5 text-muted-foreground" />
                          <span className={isLate ? "text-rose-400 font-black" : "text-foreground"}>
                            {proj.ageMinutes}m
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-4">
                      {/* Station Checklist */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span>Station Readiness</span>
                          <span>
                            {proj.readyItemsCount} / {proj.totalItemsCount} Items Ready
                          </span>
                        </div>

                        <div className="space-y-2">
                          {proj.stationTickets.map((st) => (
                            <div
                              key={st.ticketId}
                              className={`rounded-xl border p-2.5 text-xs transition ${
                                st.isReady
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : "bg-secondary/40 border-border text-foreground"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold flex items-center gap-1.5">
                                  {st.isReady ? (
                                    <CheckCheck className="size-4 text-emerald-400" />
                                  ) : (
                                    <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                                  )}
                                  {st.stationName}
                                </span>
                                <Badge
                                  className={`text-[10px] font-mono ${
                                    st.isReady
                                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                      : "bg-secondary text-muted-foreground"
                                  }`}
                                >
                                  {st.status.toUpperCase()}
                                </Badge>
                              </div>

                              <div className="mt-1 pl-5 text-[11px] text-muted-foreground space-y-0.5">
                                {st.items.map((item) => (
                                  <div key={item.orderItemId} className="flex justify-between">
                                    <span>
                                      {item.quantity}x {item.name}
                                    </span>
                                    <span className="font-mono text-[10px]">{item.status}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Primary Expo Delivery Action */}
                      <Button
                        size="lg"
                        className={`w-full font-bold text-xs ${
                          proj.isAllStationsReady
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        }`}
                        onClick={async () => {
                          if (onDeliverExpoCourse) {
                            await onDeliverExpoCourse(proj.sessionId, proj.course);
                          }
                        }}
                      >
                        {proj.isAllStationsReady ? (
                          <>
                            <CheckCheck className="size-4 mr-1.5" />
                            All Stations Ready · Deliver Course
                          </>
                        ) : (
                          <>
                            <Utensils className="size-4 mr-1.5" />
                            Bump Course to Table ({proj.readyItemsCount}/{proj.totalItemsCount} ready)
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ---------------------------------------------------------------------------------
            2. LINE STATION TICKET VIEW (Touch-Optimized)
           --------------------------------------------------------------------------------- */
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayedTickets.length === 0 ? (
            <div className="col-span-full py-16 text-center">
              <CheckCircle2 className="mx-auto size-10 text-muted-foreground/50" />
              <h3 className="mt-2 text-sm font-bold text-foreground">Station Queue Empty</h3>
              <p className="text-xs text-muted-foreground">
                No active tickets assigned to {selectedStation.toUpperCase()}.
              </p>
            </div>
          ) : (
            displayedTickets.map((ticket) => {
              const timerClass = getTimerStyle(ticket.createdAt, ticket.status);
              const ageMin = getTicketAgeMinutes(ticket.createdAt);

              return (
                <Card
                  key={ticket.id}
                  className={`overflow-hidden border-2 flex flex-col justify-between transition-all ${
                    ticket.status === "ready"
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : ticket.status === "in_prep"
                      ? "border-amber-500/50 bg-card"
                      : "border-border bg-card"
                  }`}
                >
                  <div>
                    {/* Ticket Header */}
                    <CardHeader className="p-4 pb-2.5 border-b bg-background/40">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-base font-black text-foreground">
                              {ticket.tableLabel}
                            </span>
                            <Badge className="font-mono text-[10px] uppercase bg-secondary">
                              {ticket.course}
                            </Badge>
                          </div>
                          <span className="text-[11px] font-bold text-primary block mt-0.5">
                            Station: {ticket.stationId.toUpperCase()}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full border text-[11px] font-mono font-bold flex items-center gap-1 ${timerClass}`}>
                            <Clock className="size-3" />
                            {ageMin}m
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Ticket Items List */}
                    <CardContent className="p-4 space-y-3">
                      <div className="divide-y divide-border/60">
                        {ticket.items.map((item) => (
                          <div
                            key={item.orderItemId}
                            className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-2"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-sm text-foreground">
                                  {item.quantity}×
                                </span>
                                <strong className="text-sm text-foreground">{item.name}</strong>
                                {item.seatNumber && (
                                  <Badge className="text-[9px] px-1 py-0 bg-secondary">
                                    Seat {item.seatNumber}
                                  </Badge>
                                )}
                              </div>

                              {/* Allergy Warning Banner */}
                              {item.hasAllergens && (
                                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[10px] uppercase tracking-wide">
                                  <AlertTriangle className="size-3" />
                                  ALLERGEN: {item.allergens.join(", ")}
                                </div>
                              )}

                              {/* Formatted Semantic Modifiers */}
                              {item.modifiers.length > 0 && (
                                <div className="text-[11px] font-medium text-amber-400 pl-4 space-y-0.5">
                                  {item.modifiers.map((mod, idx) => (
                                    <div key={idx}>• {mod}</div>
                                  ))}
                                </div>
                              )}

                              {/* Special Instructions */}
                              {item.specialInstructions && (
                                <div className="text-[10px] text-muted-foreground italic pl-4">
                                  Note: &quot;{item.specialInstructions}&quot;
                                </div>
                              )}
                            </div>

                            {/* Item status badge */}
                            <Badge
                              className={`text-[10px] uppercase font-mono shrink-0 ${
                                item.status === "ready"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                  : item.status === "preparing"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              {item.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </div>

                  {/* Large Touch Bump Controls Footer */}
                  <div className="p-3 pt-0 border-t bg-secondary/10 mt-2">
                    {ticket.status === "queued" && (
                      <Button
                        size="lg"
                        className="w-full font-bold text-xs h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={() => onAcceptTicket(ticket.sessionId, ticket.id)}
                      >
                        <CheckCircle2 className="size-4 mr-1.5" />
                        Accept Ticket
                      </Button>
                    )}

                    {ticket.status === "accepted" && (
                      <Button
                        size="lg"
                        className="w-full font-bold text-xs h-11 bg-amber-500 text-black hover:bg-amber-400"
                        onClick={async () => {
                          for (const item of ticket.items) {
                            await onStartItem(ticket.sessionId, ticket.id, item.orderItemId);
                          }
                        }}
                      >
                        <Flame className="size-4 mr-1.5" />
                        Start Preparation (In Prep)
                      </Button>
                    )}

                    {ticket.status === "in_prep" && (
                      <Button
                        size="lg"
                        className="w-full font-bold text-xs h-11 bg-emerald-600 text-white hover:bg-emerald-500"
                        onClick={async () => {
                          for (const item of ticket.items) {
                            await onMarkItemReady(ticket.sessionId, ticket.id, item.orderItemId);
                          }
                        }}
                      >
                        <CheckCheck className="size-4 mr-1.5" />
                        Mark Ready (Expo)
                      </Button>
                    )}

                    {ticket.status === "ready" && (
                      <Button
                        size="lg"
                        className="w-full font-bold text-xs h-11 bg-emerald-700 hover:bg-emerald-600 text-white"
                        onClick={() =>
                          onDeliverTicket(
                            ticket.sessionId,
                            ticket.id,
                            ticket.items.map((i) => i.orderItemId)
                          )
                        }
                      >
                        <ArrowRight className="size-4 mr-1.5" />
                        Deliver to Floor
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
